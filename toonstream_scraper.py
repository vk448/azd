import requests
import re
import json
import time


def get_anime_info(mal_id):
    """Get anime info from Jikan API"""
    url = f"https://api.jikan.moe/v4/anime/{mal_id}"
    for attempt in range(3):
        resp = requests.get(url)
        if resp.status_code == 200:
            data = resp.json()["data"]
            return data["title"], data.get("episodes") or 0, data.get("relations", [])
        time.sleep(2 ** attempt)
    return None, 0, []


def get_sequel_ids(relations):
    """Extract sequel MAL IDs from relations"""
    ids = []
    for rel in relations:
        if rel["relation"] in ("Sequel", "Side story", "Alternative", "Spin-off"):
            for entry in rel["entry"]:
                if entry["type"] == "anime":
                    ids.append(entry["mal_id"])
    return ids


def get_all_seasons(mal_id):
    """Recursively get all seasons"""
    title, total_eps, relations = get_anime_info(mal_id)
    if not title:
        return []

    seasons = [{"mal_id": mal_id, "title": title, "episodes": total_eps}]
    seen = {mal_id}

    for sid in get_sequel_ids(relations):
        if sid not in seen:
            seen.add(sid)
            t, e, r = get_anime_info(sid)
            if t:
                seasons.append({"mal_id": sid, "title": t, "episodes": e})
                time.sleep(1)

    return seasons


def build_url(anime_name, season, episode):
    """Build toonstream episode URL"""
    slug = re.sub(r'[^a-z0-9\s-]', '', anime_name.lower())
    slug = re.sub(r'\s+', '-', slug.strip())
    slug = re.sub(r'-+', '-', slug)
    return f"https://toonstream.vip/episode/{slug}-{season}x{episode}/"


def get_trembed_url(episode_url):
    """Get trembed iframe URL from episode page"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://toonstream.vip/",
    }
    try:
        resp = requests.get(episode_url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"

        html = resp.text

        # Find trembed iframe URL: https://toonstream.vip/?trembed=0&trid=13705&trtype=2
        match = re.search(r'iframe[^>]+src=["\']?(https?://toonstream\.vip/\?trembed=[^"\'>\s]+)', html)
        if match:
            return match.group(1).replace('&amp;', '&'), None

        # Try alternative pattern
        match = re.search(r'trembed=(\d+)[^"]*trid=(\d+)[^"]*trtype=(\d+)', html)
        if match:
            return f"https://toonstream.vip/?trembed={match.group(1)}&trid={match.group(2)}&trtype={match.group(3)}", None

        return None, "No trembed iframe found"
    except Exception as e:
        return None, str(e)


def get_video_from_trembed(trembed_url):
    """Follow trembed URL to get actual video iframe (as-cdn21.top etc)"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://toonstream.vip/",
    }
    try:
        resp = requests.get(trembed_url, headers=headers, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"

        html = resp.text

        # Find the actual video iframe (as-cdn21.top, etc)
        # Pattern 1: iframe with src containing /video/
        match = re.search(r'<iframe[^>]+src=["\']?(https?://[^"\'>\s]+/video/[a-f0-9]+)', html)
        if match:
            return match.group(1).replace('&amp;', '&'), None

        # Pattern 2: any iframe with as-cdn
        match = re.search(r'<iframe[^>]+src=["\']?(https?://as-cdn[^"\'>\s]+)', html)
        if match:
            return match.group(1).replace('&amp;', '&'), None

        # Pattern 3: any iframe src
        matches = re.findall(r'<iframe[^>]+src=["\']?(https?://[^"\'>\s]+)', html)
        for m in matches:
            if 'toonstream' not in m and 'cloudflare' not in m:
                return m.replace('&amp;', '&'), None

        return None, f"No video iframe found (page length: {len(html)})"
    except Exception as e:
        return None, str(e)


def get_video_url_from_iframe(iframe_url):
    """Extract video ID from iframe URL and get m3u8 via POST"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://toonstream.vip/",
        "Origin": "https://toonstream.vip",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    # Extract video ID from URL
    match = re.search(r'/video/([a-f0-9]+)', iframe_url)
    if not match:
        return None, "Cannot extract video ID from URL"

    video_id = match.group(1)

    # Get the base URL
    base_match = re.match(r'(https?://[^/]+)', iframe_url)
    if not base_match:
        return None, "Cannot extract base URL"

    base_url = base_match.group(1)

    # POST to getVideo endpoint
    api_url = f"{base_url}/player/index.php?data={video_id}&do=getVideo"
    post_data = {
        "hash": video_id,
        "r": "https://toonstream.vip/",
    }

    try:
        resp = requests.post(api_url, data=post_data, headers=headers, timeout=15)
        if resp.status_code != 200:
            return None, f"API returned HTTP {resp.status_code}"

        # Check if JSON
        try:
            data = resp.json()
        except:
            return None, f"Response is not JSON: {resp.text[:200]}"

        result = {
            "video_id": video_id,
            "iframe_url": iframe_url,
            "api_url": api_url,
        }

        if data.get("videoSource"):
            result["m3u8"] = data["videoSource"]
            result["hls"] = data.get("hls", False)

        if data.get("videoSources"):
            result["sources"] = data["videoSources"]

        if data.get("downloadLinks"):
            result["download_links"] = data["downloadLinks"]

        if data.get("videoImage"):
            result["poster"] = data["videoImage"]

        return result, None

    except Exception as e:
        return None, str(e)


def scrape_anime(anime_name, seasons_data, output_file="toonstream_links.json"):
    """Scrape all episodes for all seasons"""
    all_data = {}

    for season in seasons_data:
        season_num = season.get("season", 1)
        total_eps = season.get("episodes", 0)
        title = season["title"]

        if total_eps == 0:
            total_eps = 25

        print(f"\n{'='*50}")
        print(f"  Season {season_num}: {title} ({total_eps} episodes)")
        print(f"{'='*50}")

        season_key = f"s{season_num:02d}"
        all_data[season_key] = {
            "title": title,
            "mal_id": season.get("mal_id"),
            "episodes": {}
        }

        for ep in range(1, total_eps + 1):
            url = build_url(title, season_num, ep)
            print(f"  [EP {ep:02d}]")

            # Step 1: Get trembed URL from episode page
            trembed_url, error = get_trembed_url(url)
            if error:
                print(f"         Error: {error}")
                all_data[season_key]["episodes"][f"e{ep:02d}"] = {
                    "page_url": url,
                    "error": error
                }
                time.sleep(0.5)
                continue

            # Step 2: Get video iframe URL from trembed
            iframe_url, error = get_video_from_trembed(trembed_url)
            if error:
                print(f"         Error: {error}")
                if 'No video iframe' in error:
                    print(f"         trembed_url: {trembed_url}")
                all_data[season_key]["episodes"][f"e{ep:02d}"] = {
                    "page_url": url,
                    "trembed_url": trembed_url,
                    "error": error
                }
                time.sleep(0.5)
                continue

            # Step 3: Get m3u8 from video iframe
            video_data, error = get_video_url_from_iframe(iframe_url)
            if error:
                print(f"         Error: {error}")
                all_data[season_key]["episodes"][f"e{ep:02d}"] = {
                    "page_url": url,
                    "trembed_url": trembed_url,
                    "iframe_url": iframe_url,
                    "error": error
                }
            else:
                all_data[season_key]["episodes"][f"e{ep:02d}"] = {
                    "page_url": url,
                    "trembed_url": trembed_url,
                    **video_data
                }
                m3u8 = video_data.get("m3u8", "N/A")
                print(f"         OK: {m3u8[:60]}...")

            time.sleep(0.5)

    # Save to JSON
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n[OK] Saved to {output_file}")
    return all_data


def main():
    print("=" * 50)
    print("  ToonStream Scraper v3")
    print("  trembed -> iframe -> m3u8")
    print("=" * 50)

    mal_id = input("\nEnter MAL ID: ").strip()
    if not mal_id.isdigit():
        print("Invalid MAL ID")
        return

    print(f"\nFetching anime info for MAL ID {mal_id}...")
    title, total_eps, relations = get_anime_info(mal_id)

    if not title:
        print("Anime not found!")
        return

    print(f"  Title: {title}")
    print(f"  Episodes: {total_eps or 'Unknown'}")

    print("\nChecking for sequels/seasons...")
    all_seasons = get_all_seasons(int(mal_id))

    if not all_seasons:
        all_seasons = [{"mal_id": int(mal_id), "title": title, "episodes": total_eps}]

    print(f"\nFound {len(all_seasons)} season(s):")
    for i, s in enumerate(all_seasons, 1):
        print(f"  {i}. {s['title']} ({s['episodes'] or '?'} eps)")

    choice = input(f"\nHow many seasons to scrape? (1-{len(all_seasons)} or 'all'): ").strip()

    if choice.lower() == 'all':
        seasons_to_scrape = all_seasons
    else:
        try:
            n = int(choice)
            seasons_to_scrape = all_seasons[:n]
        except ValueError:
            seasons_to_scrape = [all_seasons[0]]

    for i, s in enumerate(seasons_to_scrape, 1):
        s["season"] = i

    total_eps = sum(s.get("episodes", 0) or 0 for s in seasons_to_scrape)
    print(f"\nWill scrape ~{total_eps} episodes across {len(seasons_to_scrape)} season(s)")
    confirm = input("Continue? (y/n): ").strip().lower()

    if confirm != 'y':
        print("Cancelled.")
        return

    output_file = f"toonstream_{title.replace(' ', '_').lower()}.json"
    scrape_anime(title, seasons_to_scrape, output_file)


if __name__ == "__main__":
    main()
