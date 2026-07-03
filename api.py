from fastapi import FastAPI, Query, HTTPException, Path
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import requests
import re
import time
import threading
from bs4 import BeautifulSoup
from urllib.parse import quote


app = FastAPI(
    title="9Anime Scraper API",
    description="API to scrape download links from 9anime.org.lv",
    version="3.0.0",
)


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

_mal_cache = {}
_mal_cache_lock = threading.Lock()
_download_cache = {}
_download_cache_lock = threading.Lock()
_session = requests.Session()
_session.headers.update(HEADERS)


class DownloadLink(BaseModel):
    label: str
    url: str
    best: bool


class EpisodeResponse(BaseModel):
    anime: str
    episode: int
    mal_id: str
    downloads: dict[str, list[DownloadLink]]


class ErrorResponse(BaseModel):
    error: str


def get_mal_info(mal_id: int) -> dict:
    with _mal_cache_lock:
        if mal_id in _mal_cache:
            return _mal_cache[mal_id]

    try:
        resp = _session.get(f"{JIKAN_API}/anime/{mal_id}", timeout=10)
        if resp.status_code == 429:
            time.sleep(1)
            resp = _session.get(f"{JIKAN_API}/anime/{mal_id}", timeout=10)
        resp.raise_for_status()
        data = resp.json()["data"]

        info = {
            "mal_id": mal_id,
            "title": data.get("title", ""),
            "title_english": data.get("title_english") or data.get("title", ""),
            "episodes": data.get("episodes"),
            "type": data.get("type", ""),
        }

        with _mal_cache_lock:
            _mal_cache[mal_id] = info
        return info
    except Exception as e:
        raise ValueError(f"Failed to fetch MAL info: {e}")


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

                entry = DownloadLink(label=label, url=href, best=is_best)

                if section_type == "SUBTITLED":
                    result["subtitled"].append(entry)
                elif section_type == "DUBBED":
                    result["dubbed"].append(entry)

    return result


def fetch_download_links_cached(mal_id: str, ep: str) -> dict:
    cache_key = f"{mal_id}:{ep}"
    with _download_cache_lock:
        if cache_key in _download_cache:
            cached = _download_cache[cache_key]
            if time.time() - cached["time"] < 3600:
                return cached["data"]

    resp = _session.post(
        AJAX_URL,
        data={"action": "fetch_download_links", "mal_id": mal_id, "ep": ep},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    with _download_cache_lock:
        _download_cache[cache_key] = {"data": data, "time": time.time()}
    return data


def title_to_slug(title: str) -> str:
    slug = title.lower()
    slug = slug.replace(":", "").replace("'", "").replace('"', "")
    slug = slug.replace("(", "").replace(")", "")
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug.strip())
    slug = re.sub(r"-+", "-", slug)
    return slug


def fetch_anime_image(anime_name: str, episode: int) -> str:
    slug = title_to_slug(anime_name)
    url = f"{BASE_URL}{slug}-episode-{episode}/"
    try:
        resp = _session.get(url, timeout=8)
        if resp.status_code == 200:
            match = re.search(r"background-image:\s*url\('([^']+)'\)", resp.text)
            if match:
                return match.group(1)
            match = re.search(r'property="og:image"\s+content="([^"]+)"', resp.text)
            if match:
                return match.group(1)
    except Exception:
        pass
    return ""


def generate_landing_page(anime_name: str, episode: int, image_url: str, sub_url: str, dub_url: str) -> str:
    with open("template.html", "r", encoding="utf-8") as f:
        template = f.read()

    sub_button = ""
    if sub_url:
        sub_button = f'''<a href="{sub_url}" target="_blank" class="dl-btn sub">
                    <div class="dl-icon"><i class="fas fa-closed-captioning"></i></div>
                    <div class="dl-info">
                        <span class="main-text">Download SUB</span>
                        <span class="sub-text">Subtitle (Default)</span>
                    </div>
                    <i class="fas fa-chevron-right dl-arrow"></i>
                </a>'''
    else:
        sub_button = '''<div class="dl-btn sub disabled">
                    <div class="dl-icon"><i class="fas fa-closed-captioning"></i></div>
                    <div class="dl-info">
                        <span class="main-text">SUB Unavailable</span>
                        <span class="sub-text">Not available yet</span>
                    </div>
                </div>'''

    dub_button = ""
    if dub_url:
        dub_button = f'''<a href="{dub_url}" target="_blank" class="dl-btn dub">
                    <div class="dl-icon"><i class="fas fa-microphone"></i></div>
                    <div class="dl-info">
                        <span class="main-text">Download DUB</span>
                        <span class="sub-text">English Dubbed (Default)</span>
                    </div>
                    <i class="fas fa-chevron-right dl-arrow"></i>
                </a>'''
    else:
        dub_button = '''<div class="dl-btn dub disabled">
                    <div class="dl-icon"><i class="fas fa-microphone"></i></div>
                    <div class="dl-info">
                        <span class="main-text">DUB Unavailable</span>
                        <span class="sub-text">Not available yet</span>
                    </div>
                </div>'''

    html = template.replace("{{ANIME_NAME}}", anime_name)
    html = html.replace("{{EPISODE}}", str(episode))
    html = html.replace("{{IMAGE_URL}}", image_url)
    html = html.replace("{{SUB_BUTTON}}", sub_button)
    html = html.replace("{{DUB_BUTTON}}", dub_button)
    html = html.replace("{{QUALITY}}", "1080p")

    return html


def find_episode_page(title: str) -> tuple[str, str] | None:
    cache_key = f"ep_page:{title}"
    with _download_cache_lock:
        if cache_key in _download_cache:
            cached = _download_cache[cache_key]
            if time.time() - cached["time"] < 3600:
                return cached["data"]

    slug = title_to_slug(title)
    test_url = f"{BASE_URL}{slug}-episode-1/"
    try:
        resp = _session.get(test_url, timeout=8)
        if resp.status_code == 200:
            match = re.search(r'var malId\s*=\s*["\'](\d+)', resp.text)
            if match:
                result = (test_url, match.group(1))
                with _download_cache_lock:
                    _download_cache[cache_key] = {"data": result, "time": time.time()}
                return result
    except Exception:
        pass

    return None


def scrape_episode_fast(mal_id: int, episode_no: int) -> dict:
    mal_info = get_mal_info(mal_id)
    anime_name = mal_info["title_english"] or mal_info["title"]

    result = find_episode_page(anime_name)
    if not result:
        raise ValueError(f"Anime not found on 9anime: {anime_name}")

    _, internal_mal_id = result
    ajax_response = fetch_download_links_cached(internal_mal_id, str(episode_no))

    if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
        raise ValueError("No download links available")

    download_html = ajax_response["data"].get("result", "")
    downloads = parse_download_html(download_html)

    return {
        "anime": anime_name,
        "episode": episode_no,
        "mal_id": internal_mal_id,
        "downloads": downloads,
    }


def scrape_range_fast(mal_id: int, start: int, end: int) -> dict:
    mal_info = get_mal_info(mal_id)
    anime_name = mal_info["title_english"] or mal_info["title"]

    result = find_episode_page(anime_name)
    if not result:
        raise ValueError(f"Anime not found on 9anime: {anime_name}")

    _, internal_mal_id = result

    results = []
    for ep in range(start, end + 1):
        try:
            ajax_response = fetch_download_links_cached(internal_mal_id, str(ep))

            if not ajax_response.get("data") or ajax_response["data"].get("status") != 200:
                results.append({"episode": ep, "error": "No download links available"})
                continue

            download_html = ajax_response["data"].get("result", "")
            downloads = parse_download_html(download_html)

            results.append({
                "anime": anime_name,
                "episode": ep,
                "mal_id": internal_mal_id,
                "downloads": downloads,
            })
        except Exception as e:
            results.append({"episode": ep, "error": str(e)})

    return {"anime": anime_name, "mal_id": internal_mal_id, "episodes": results}


@app.get("/api/mal/{mal_id}", response_model=EpisodeResponse, responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def get_episode_by_mal(
    mal_id: int = Path(..., description="MyAnimeList ID", examples=[62568]),
    episode: int = Query(..., description="Episode number", ge=1, examples=[1]),
):
    """Get download links using MAL ID. First call ~2s, cached calls <50ms."""
    try:
        result = scrape_episode_fast(mal_id, episode)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")


@app.get("/api/mal/{mal_id}/page", response_class=HTMLResponse)
async def get_episode_page(
    mal_id: int = Path(..., description="MyAnimeList ID", examples=[62568]),
    episode: int = Query(..., description="Episode number", ge=1, examples=[1]),
):
    """Get AnimeZilla landing page for an episode with download buttons."""
    try:
        result = scrape_episode_fast(mal_id, episode)
        anime_name = result["anime"]
        sub_url = ""
        dub_url = ""

        if result["downloads"]["subtitled"]:
            sub_link = result["downloads"]["subtitled"][0]
            sub_url = sub_link.url if hasattr(sub_link, "url") else sub_link["url"]
        if result["downloads"]["dubbed"]:
            dub_link = result["downloads"]["dubbed"][0]
            dub_url = dub_link.url if hasattr(dub_link, "url") else dub_link["url"]

        image_url = fetch_anime_image(anime_name, episode)

        html = generate_landing_page(anime_name, episode, image_url, sub_url, dub_url)
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Page generation failed: {e}")


@app.get("/api/mal/{mal_id}/episodes", responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def get_episodes_by_mal(
    mal_id: int = Path(..., description="MyAnimeList ID", examples=[62568]),
    start: int = Query(1, description="Start episode number", ge=1, examples=[1]),
    end: int = Query(3, description="End episode number", ge=1, examples=[3]),
):
    """Get download links for a range of episodes using MAL ID."""
    if start > end:
        raise HTTPException(status_code=400, detail="start must be <= end")
    if end - start > 50:
        raise HTTPException(status_code=400, detail="Range too large (max 50 episodes)")

    try:
        result = scrape_range_fast(mal_id, start, end)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")


@app.get("/api/mal/{mal_id}/info")
async def get_mal_anime_info(
    mal_id: int = Path(..., description="MyAnimeList ID", examples=[62568]),
):
    """Get anime info from MAL ID."""
    try:
        info = get_mal_info(mal_id)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {e}")


def get_mal_id_from_url(anime_url: str) -> str | None:
    slug = anime_url.rstrip("/").split("/")[-1]
    ep1_url = f"{BASE_URL}{slug}-episode-1/"
    try:
        resp = _session.get(ep1_url, timeout=10)
        if resp.status_code == 200:
            match = re.search(r'var malId\s*=\s*["\'](\d+)', resp.text)
            if match:
                return match.group(1)
    except Exception:
        pass
    return None


@app.get("/api/search")
async def search_anime(
    q: str = Query(..., description="Search query", examples=["Dr. Stone"]),
    mal: bool = Query(False, description="Fetch MAL ID for each result (slower)"),
):
    """Search for anime on 9anime. Set mal=true to include MAL IDs."""
    try:
        resp = _session.get(BASE_URL, params={"s": q}, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        results = []
        for item in soup.select(".bsx"):
            a = item.find("a")
            title_el = item.select_one(".tt")
            ep = item.select_one(".epxs")
            if a and title_el:
                title = a.get("title", "") or title_el.get_text(strip=True)
                url = a.get("href", "")

                entry = {
                    "title": title,
                    "url": url,
                    "episode": ep.get_text(strip=True) if ep else None,
                    "mal_id": None,
                }

                if mal and url:
                    cached_id = None
                    with _download_cache_lock:
                        cache_key = f"mal_url:{url}"
                        if cache_key in _download_cache:
                            cached_val = _download_cache[cache_key]
                            if time.time() - cached_val["time"] < 3600:
                                cached_id = cached_val["data"]

                    if cached_id:
                        entry["mal_id"] = cached_id
                    else:
                        found_id = get_mal_id_from_url(url)
                        if found_id:
                            entry["mal_id"] = found_id
                            with _download_cache_lock:
                                _download_cache[f"mal_url:{url}"] = {"data": found_id, "time": time.time()}

                results.append(entry)

        return {"query": q, "count": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


@app.get("/api/page", response_class=HTMLResponse)
async def generate_custom_page(
    title: str = Query(..., description="Anime title", examples=["Dr. Stone Science Future Part 3 Dub"]),
    episode: int = Query(..., description="Episode number", ge=1, examples=[1]),
    sub: str = Query("", description="SUB download URL"),
    dub: str = Query("", description="DUB download URL"),
    image: str = Query("", description="Background image URL (auto-fetched if empty)"),
):
    """Generate AnimeZilla landing page with custom parameters."""
    try:
        if not image:
            image = fetch_anime_image(title, episode)

        html = generate_landing_page(title, episode, image, sub, dub)
        return HTMLResponse(content=html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Page generation failed: {e}")


@app.get("/api/warm")
async def warm_cache(
    mal_id: int = Query(..., description="MyAnimeList ID to pre-cache", examples=[62568]),
    episodes: str = Query("1,2,3", description="Comma-separated episode numbers"),
):
    """Pre-warm cache for faster subsequent requests."""
    try:
        get_mal_info(mal_id)
        ep_list = [int(e.strip()) for e in episodes.split(",")]
        for ep in ep_list:
            fetch_download_links_cached(str(mal_id), str(ep))
        return {"status": "warmed", "mal_id": mal_id, "episodes": ep_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Warm failed: {e}")


@app.get("/")
async def root():
    return {
        "name": "AnimeZilla API",
        "version": "3.0.0",
        "endpoints": {
            "GET /api/mal/{mal_id}?episode=N": "Get episode JSON by MAL ID",
            "GET /api/mal/{mal_id}/page?episode=N": "Get AnimeZilla landing page by MAL ID",
            "GET /api/mal/{mal_id}/episodes?start=N&end=N": "Get episodes range by MAL ID",
            "GET /api/mal/{mal_id}/info": "Get anime info from MAL ID",
            "GET /api/page?title=...&episode=N&sub=URL&dub=URL": "Generate custom landing page",
            "GET /api/search?q=...&mal=true": "Search anime with MAL IDs",
            "GET /api/warm?mal_id=N&episodes=1,2,3": "Pre-warm cache",
            "GET /docs": "Interactive API documentation",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
