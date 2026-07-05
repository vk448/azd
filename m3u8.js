const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function jikanInfo(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${id}`, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const d = await r.json();
      const a = d.data || {};
      return { title: a.title || "", eng: a.title_english || a.title || "", episodes: a.episodes || 0, image: a.images?.jpg?.large_image_url || "" };
    }
    if (r.status === 429 || r.status >= 500) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`JIKAN_ERROR_${r.status}`);
  }
  throw new Error("JIKAN_RATE_LIMIT");
}

let ANIME_CACHE = null;
let CACHE_TIME = 0;

async function loadAnimeCache() {
  if (ANIME_CACHE && Date.now() - CACHE_TIME < 3600000) return ANIME_CACHE;
  try {
    const r = await fetch("https://blakiteapi.xyz/api/getAllAnime.php", { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.data) return null;
    const index = {};
    const all = { ...d.data.series, ...d.data.movies };
    for (const [key, item] of Object.entries(all)) {
      const t = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (t) index[t] = item;
      if (item.originalTmdbId) index["tmdb_" + item.originalTmdbId] = item;
    }
    ANIME_CACHE = index;
    CACHE_TIME = Date.now();
    return ANIME_CACHE;
  } catch { return null; }
}

async function findAnimeByTitle(title) {
  const cache = await loadAnimeCache();
  if (!cache) return null;
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cache[t]) return cache[t];
  for (const [key, item] of Object.entries(cache)) {
    if (key.includes(t) || t.includes(key)) return item;
  }
  return null;
}

async function getTrembedUrl(episodeUrl) {
  try {
    const r = await fetch(episodeUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/iframe[^>]+src=["']?(https?:\/\/toonstream\.vip\/\?trembed=[^"'\s]+)/);
    if (!m) return null;
    return m[1].replace(/&amp;/g, "&").replace(/&#0?38;/g, "&");
  } catch { return null; }
}

async function getVideoIframe(trembedUrl) {
  try {
    const r = await fetch(trembedUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return null;
    const html = await r.text();
    const srcMatch = html.match(/src="(https?:\/\/[^"]+\/video\/[a-f0-9]+)/) || html.match(/src=(https?:\/\/[^>\s]+\/video\/[a-f0-9]+)/);
    if (!srcMatch) return null;
    return srcMatch[1].replace(/&amp;/g, "&");
  } catch { return null; }
}

async function getM3u8(iframeUrl) {
  try {
    const videoId = iframeUrl.match(/\/video\/([a-f0-9]+)/)?.[1];
    if (!videoId) return null;

    const iframePage = await fetch(iframeUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
    const cookies = iframePage.headers.getSetCookie?.() || [];
    const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");

    const r = await fetch(`https://as-cdn21.top/player/index.php?data=${videoId}&do=getVideo`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Referer": iframeUrl,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://as-cdn21.top",
        "Cookie": cookieStr
      },
      body: `hash=${videoId}&r=${encodeURIComponent(iframeUrl)}`
    });

    const text = await r.text();
    if (!text) return null;
    try {
      const j = JSON.parse(text);
      return j.videoSource || null;
    } catch { return null; }
  } catch { return null; }
}

async function getEpisodeM3u8(slug, season, ep) {
  const pageUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
  const trembed = await getTrembedUrl(pageUrl);
  if (!trembed) return null;
  const iframe = await getVideoIframe(trembed);
  if (!iframe) return null;
  const m3u8 = await getM3u8(iframe);
  return m3u8;
}

async function main() {
  const malId = parseInt(process.argv[2]);
  if (!malId) {
    console.log("Usage: node m3u8.js <mal_id>");
    console.log("Example: node m3u8.js 38691");
    process.exit(1);
  }

  console.log(`Fetching MAL ID ${malId}...`);
  const info = await jikanInfo(malId);
  const title = info.eng || info.title;
  console.log(`Title: ${title}`);

  const cached = await findAnimeByTitle(title);
  let seasons = [];
  if (cached?.seasons) {
    seasons = Object.values(cached.seasons).map(s => ({
      number: s.seasonNumber,
      episodes: s.totalEpisodes || 0
    }));
  }

  if (seasons.length === 0) {
    console.log("No season data found. Using Jikan episode count.");
    const epCount = info.episodes || 12;
    seasons = [{ number: 1, episodes: epCount }];
  }

  const slug = title.toLowerCase().replace(/[:'"()]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  console.log(`\nSeasons: ${seasons.length}`);
  console.log(`Slug: ${slug}\n`);

  const results = [];

  for (const season of seasons) {
    console.log(`--- Season ${season.number} (${season.episodes} episodes) ---`);
    for (let ep = 1; ep <= season.episodes; ep++) {
      const m3u8 = await getEpisodeM3u8(slug, season.number, ep);
      const entry = { season: season.number, episode: ep, m3u8 };
      results.push(entry);

      if (m3u8) {
        console.log(`  S${season.number}E${ep}: ${m3u8}`);
      } else {
        console.log(`  S${season.number}E${ep}: NOT FOUND`);
      }

      await new Promise(r => setTimeout(r, 300));
    }
  }

  const fs = require("fs");
  const outFile = `m3u8_${malId}.json`;
  fs.writeFileSync(outFile, JSON.stringify({ title, mal_id: malId, episodes: results }, null, 2));
  console.log(`\nSaved ${results.length} episodes to ${outFile}`);
  console.log(`Found ${results.filter(r => r.m3u8).length} working m3u8 URLs`);
}

main().catch(e => console.error("Error:", e.message));
