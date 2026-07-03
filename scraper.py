import requests
import re
import json
import sys
import time
from bs4 import BeautifulSoup


BASE_URL = "https://9anime.org.lv/"
AJAX_URL = "https://9anime.org.lv/wp-admin/admin-ajax.php"
JIKAN_API = "https://api.jikan.moe/v4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://9anime.org.lv/",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://9anime.org.lv",
}


def title_to_slug(title: str) -> str:
    slug = title.lower()
    slug = slug.replace(":", "").replace("'", "").replace('"', "")
    slug = slug.replace("(", "").replace(")", "")
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    slug = re.sub(r"-+", "-", slug)
    return slug


def get_mal_info(mal_id: int) -> dict:
    resp = requests.get(f"{JIKAN_API}/anime/{mal_id}", headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    if resp.status_code == 429:
        time.sleep(2)
        resp = requests.get(f"{JIKAN_API}/anime/{mal_id}", headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    data = resp.json()["data"]
    return {
        "mal_id": mal_id,
        "title": data.get("title", ""),
        "title_english": data.get("title_english") or data.get("title", ""),
        "episodes": data.get("episodes"),
        "type": data.get("type", ""),
    }


def find_9anime_url(title: str, session: requests.Session) -> str | None:
    slug = title_to_slug(title)
    test_url = f"{BASE_URL}{slug}-episode-1/"
    try:
        resp = session.get(test_url, headers=HEADERS, timeout=15, allow_redirects=True)
        if resp.status_code == 200 and "dl-big-title" in resp.text:
            return test_url
    except Exception:
        pass

    try:
        resp = session.get(BASE_URL, params={"s": title}, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for item in soup.select(".bsx"):
                a = item.find("a")
                if a and a.get("href"):
                    return a["href"]
    except Exception:
        pass

    return None


def build_episode_url(anime_title: str, episode_no: int) -> str:
    slug = title_to_slug(anime_title)
    return f"{BASE_URL}{slug}-episode-{episode_no}/"


def fetch_page(url: str, session: requests.Session) -> str:
    resp = session.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def extract_mal_id(html: str) -> str | None:
    match = re.search(r"var malId\s*=\s*'(\d+)'", html)
    if match:
        return match.group(1)
    match = re.search(r"mal_id['\"]?\s*[:=]\s*['\"](\d+)['\"]", html)
    if match:
        return match.group(1)
    return None


def extract_episode_number(html: str) -> str | None:
    match = re.search(r"var ep\s*=\s*'(\d+)'", html)
    if match:
        return match.group(1)
    match = re.search(r"Episode\s+(\d+)", html)
    if match:
        return match.group(1)
    return None


def extract_anime_title(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.find("div", class_="dl-big-title")
    if title_el:
        span = title_el.find("span")
        if span:
            return span.get_text(strip=True)
    match = re.search(r'<h2 class="dl-big-title">Download<br><span>(.*?)</span>', html)
    if match:
        return match.group(1).strip()
    return None


def fetch_download_links(mal_id: str, ep: str, session: requests.Session) -> dict:
    data = {
        "action": "fetch_download_links",
        "mal_id": mal_id,
        "ep": ep,
    }
    resp = session.post(AJAX_URL, headers=HEADERS, data=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def parse_download_html(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    result = {"subtitled": [], "dubbed": []}

    sections = soup.find_all("div", class_="dl-section-header")
    rows = soup.find_all("div", class_="dl-bubble-row")

    for i, header in enumerate(sections):
        title_el = header.find("span", class_="dl-section-title")
        if not title_el:
            continue
        section_type = title_el.get_text(strip=True).upper()

        if i < len(rows):
            row = rows[i]
            links = row.find_all("a", class_="dl-bubble-item")
            for link in links:
                href = link.get("href", "")
                text_el = link.find("span", class_="dl-bubble-text")
                label = text_el.get_text(strip=True) if text_el else "Unknown"
                is_best = bool(link.find("span", class_="dl-best-badge"))

                entry = {"label": label, "url": href, "best": is_best}

                if section_type == "SUBTITLED":
                    result["subtitled"].append(entry)
                elif section_type == "DUBBED":
                    result["dubbed"].append(entry)

    return result


def resolve_worker_url(url: str, session: requests.Session) -> str:
    try:
        resp = session.get(url, timeout=30, allow_redirects=True)
        return resp.url
    except Exception as e:
        return f"Error: {e}"


def scrape_by_mal_id(mal_id: int, episode_no: int, resolve: bool = True) -> dict:
    print(f"[*] Fetching MAL info for ID: {mal_id}", file=sys.stderr)
    mal_info = get_mal_info(mal_id)
    print(f"[*] Title: {mal_info['title_english']}", file=sys.stderr)

    session = requests.Session()

    titles_to_try = []
    if mal_info["title_english"]:
        titles_to_try.append(mal_info["title_english"])
    if mal_info["title"] and mal_info["title"] != mal_info["title_english"]:
        titles_to_try.append(mal_info["title"])

    page_url = None
    for title in titles_to_try:
        print(f"[*] Searching 9anime for: {title}", file=sys.stderr)
        found = find_9anime_url(title, session)
        if found:
            page_url = found
            print(f"[*] Found: {page_url}", file=sys.stderr)
            break

    if not page_url:
        return {"error": f"Anime not found on 9anime for MAL ID {mal_id}"}

    print(f"[*] Fetching page...", file=sys.stderr)
    html = fetch_page(page_url, session)

    found_mal_id = extract_mal_id(html)
    ep_num = extract_episode_number(html)
    anime_name = extract_anime_title(html) or mal_info["title_english"]

    if not found_mal_id:
        found_mal_id = str(mal_id)
    if not ep_num:
        ep_num = str(episode_no)

    print(f"[*] MAL ID: {found_mal_id}, Episode: {ep_num}", file=sys.stderr)
    print(f"[*] Fetching download links...", file=sys.stderr)

    ajax_response = fetch_download_links(found_mal_id, ep_num, session)

    if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
        return {"error": "No download links available"}

    download_html = ajax_response["data"].get("result", "")
    downloads = parse_download_html(download_html)

    if resolve:
        for key in ["subtitled", "dubbed"]:
            for entry in downloads[key]:
                if entry["url"]:
                    print(f"[*] Resolving: {entry['url']}", file=sys.stderr)
                    entry["resolved_url"] = resolve_worker_url(entry["url"], session)

    return {
        "anime": anime_name,
        "episode": episode_no,
        "mal_id": found_mal_id,
        "mal_info": mal_info,
        "downloads": downloads,
    }


def scrape_episode(anime_title: str, episode_no: int, resolve: bool = True) -> dict:
    url = build_episode_url(anime_title, episode_no)
    print(f"[*] Fetching page: {url}", file=sys.stderr)

    session = requests.Session()

    try:
        html = fetch_page(url, session)
    except Exception as e:
        return {"error": f"Failed to fetch page: {e}"}

    mal_id = extract_mal_id(html)
    ep_num = extract_episode_number(html)
    anime_name = extract_anime_title(html) or anime_title

    if not mal_id:
        return {"error": "Could not extract mal_id from page"}

    if not ep_num:
        ep_num = str(episode_no)

    print(f"[*] MAL ID: {mal_id}, Episode: {ep_num}", file=sys.stderr)
    print(f"[*] Fetching download links via AJAX...", file=sys.stderr)

    try:
        ajax_response = fetch_download_links(mal_id, ep_num, session)
    except Exception as e:
        return {"error": f"AJAX request failed: {e}"}

    if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
        return {"error": "No download links available", "ajax_response": ajax_response}

    download_html = ajax_response["data"].get("result", "")
    downloads = parse_download_html(download_html)

    for key in ["subtitled", "dubbed"]:
        for entry in downloads[key]:
            if entry["url"]:
                print(f"[*] Resolving: {entry['url']}", file=sys.stderr)
                entry["resolved_url"] = resolve_worker_url(entry["url"], session)

    return {
        "anime": anime_name,
        "episode": episode_no,
        "mal_id": mal_id,
        "downloads": downloads,
    }


def scrape_range(anime_title: str, start: int, end: int) -> list:
    results = []
    session = requests.Session()

    first_url = build_episode_url(anime_title, start)
    print(f"[*] Fetching first page to get MAL ID: {first_url}", file=sys.stderr)

    try:
        html = fetch_page(first_url, session)
    except Exception as e:
        return [{"error": f"Failed to fetch page: {e}"}]

    mal_id = extract_mal_id(html)
    anime_name = extract_anime_title(html) or anime_title

    if not mal_id:
        return [{"error": "Could not extract mal_id from page"}]

    print(f"[*] MAL ID: {mal_id}", file=sys.stderr)

    for ep in range(start, end + 1):
        print(f"[*] Scraping episode {ep}...", file=sys.stderr)

        try:
            ajax_response = fetch_download_links(mal_id, str(ep), session)
        except Exception as e:
            results.append({"episode": ep, "error": f"AJAX request failed: {e}"})
            continue

        if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
            results.append({"episode": ep, "error": "No download links available"})
            continue

        download_html = ajax_response["data"].get("result", "")
        downloads = parse_download_html(download_html)

        for key in ["subtitled", "dubbed"]:
            for entry in downloads[key]:
                if entry["url"]:
                    entry["resolved_url"] = resolve_worker_url(entry["url"], session)

        results.append({
            "anime": anime_name,
            "episode": ep,
            "mal_id": mal_id,
            "downloads": downloads,
        })

    return results


def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print('  By MAL ID:   python scraper.py --mal <mal_id> <episode_no>')
        print('  By title:    python scraper.py --title "anime title" <episode_no>')
        print('  Range:       python scraper.py --title "anime title" <start> <end>')
        print('  MAL Range:   python scraper.py --mal <mal_id> <start> <end>')
        print("")
        print("Examples:")
        print("  python scraper.py --mal 62568 1")
        print('  python scraper.py --title "Dr. Stone Science Future Part 3 Dub" 1')
        print("  python scraper.py --mal 62568 1 12")
        sys.exit(1)

    if sys.argv[1] == "--mal":
        mal_id = int(sys.argv[2])
        if len(sys.argv) == 4:
            ep = int(sys.argv[3])
            result = scrape_by_mal_id(mal_id, ep)
            print(json.dumps(result, indent=2))
        elif len(sys.argv) == 5:
            start = int(sys.argv[3])
            end = int(sys.argv[4])
            session = requests.Session()
            mal_info = get_mal_info(mal_id)
            titles_to_try = []
            if mal_info["title_english"]:
                titles_to_try.append(mal_info["title_english"])
            if mal_info["title"] and mal_info["title"] != mal_info["title_english"]:
                titles_to_try.append(mal_info["title"])

            page_url = None
            used_title = None
            for title in titles_to_try:
                found = find_9anime_url(title, session)
                if found:
                    page_url = found
                    used_title = title
                    break

            if not page_url:
                print(json.dumps({"error": f"Anime not found on 9anime for MAL ID {mal_id}"}, indent=2))
                sys.exit(1)

            html = fetch_page(page_url, session)
            found_mal_id = extract_mal_id(html) or str(mal_id)
            anime_name = extract_anime_title(html) or used_title

            results = []
            for ep in range(start, end + 1):
                print(f"[*] Scraping episode {ep}...", file=sys.stderr)
                try:
                    ajax_response = fetch_download_links(found_mal_id, str(ep), session)
                    if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
                        results.append({"episode": ep, "error": "No download links available"})
                        continue
                    download_html = ajax_response["data"].get("result", "")
                    downloads = parse_download_html(download_html)
                    for key in ["subtitled", "dubbed"]:
                        for entry in downloads[key]:
                            if entry["url"]:
                                entry["resolved_url"] = resolve_worker_url(entry["url"], session)
                    results.append({
                        "anime": anime_name,
                        "episode": ep,
                        "mal_id": found_mal_id,
                        "downloads": downloads,
                    })
                except Exception as e:
                    results.append({"episode": ep, "error": str(e)})

            print(json.dumps({"anime": anime_name, "mal_id": found_mal_id, "mal_info": mal_info, "episodes": results}, indent=2))
    elif sys.argv[1] == "--title":
        anime_title = sys.argv[2]
        if len(sys.argv) == 4:
            ep = int(sys.argv[3])
            result = scrape_episode(anime_title, ep)
            print(json.dumps(result, indent=2))
        elif len(sys.argv) == 5:
            start = int(sys.argv[3])
            end = int(sys.argv[4])
            results = scrape_range(anime_title, start, end)
            print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
