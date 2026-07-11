const config = require("./config");
const { nodeFetch, directFetch } = require("./fetchers");

async function loadAnimeCache() {
  if (config.ANIME_CACHE && Date.now() - config.CACHE_TIME < 3600000) return config.ANIME_CACHE;
  try {
    const r = await fetch("https://blakiteapi.xyz/api/getAllAnime.php", { headers: { "User-Agent": config.UA } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.data) return null;
    // Index by title (lowercase) for fast lookup
    const index = {};
    const all = { ...d.data.series, ...d.data.movies };
    for (const [key, item] of Object.entries(all)) {
      const t = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (t) index[t] = item;
      // Also index by originalTmdbId
      if (item.originalTmdbId) index["tmdb_" + item.originalTmdbId] = item;
    }
    config.ANIME_CACHE = index;
    config.CACHE_TIME = Date.now();
    return config.ANIME_CACHE;
  } catch { return null; }
}

async function findAnimeByTitle(title) {
  const cache = await loadAnimeCache();
  if (!cache) return null;
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Direct match
  if (cache[t]) return cache[t];
  // Partial match
  for (const [key, item] of Object.entries(cache)) {
    if (key.includes(t) || t.includes(key)) return item;
  }
  return null;
}

async function getTvmazeSeasons(title) {
  try {
    const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, { headers: { "User-Agent": config.UA } });
    if (!r.ok) return [];
    const results = await r.json();
    if (!results.length) return [];
    const showId = results[0].show.id;
    const sr = await fetch(`https://api.tvmaze.com/shows/${showId}/seasons`, { headers: { "User-Agent": config.UA } });
    if (!sr.ok) return [];
    const seasons = await sr.json();
    return seasons.map(s => ({ number: s.number, name: s.name || "", episodes: s.episodeOrder || 0, premiered: s.premiereDate || "" }));
  } catch { return []; }
}

function toonSlug(title) {
  const base = title.split(":")[0].split("-")[0].trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
  return base;
}

async function getTrembedUrl(episodeUrl) {
  try {
    const r = await fetch(episodeUrl, { headers: { "User-Agent": config.UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/iframe[^>]+src=["']?(https?:\/\/toonstream\.vip\/\?trembed=[^"'\s]+)/);
    if (!m) return null;
    return m[1].replace(/&amp;/g, "&").replace(/&#0?38;/g, "&");
  } catch { return null; }
}

async function getToonVideo(trembedUrl) {
  try {
    const r = await fetch(trembedUrl, { headers: { "User-Agent": config.UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return { error: "Failed to load trembed" };
    const html = await r.text();

    const srcMatch = html.match(/src="(https?:\/\/[^"]+\/video\/[a-f0-9]+)/) || html.match(/src=(https?:\/\/[^>\s]+\/video\/[a-f0-9]+)/);
    if (!srcMatch) return { error: "No video iframe found" };

    const iframeUrl = srcMatch[1].replace(/&amp;/g, "&");
    const vm = iframeUrl.match(/\/video\/([a-f0-9]+)/);
    if (!vm) return { error: "Cannot extract video ID" };

    return {
      video_id: vm[1],
      iframe_url: iframeUrl,
      embed_url: iframeUrl,
      note: "Open iframe_url in browser to play"
    };
  } catch (e) { return { error: e.message }; }
}

module.exports = {
  loadAnimeCache,
  findAnimeByTitle,
  getTvmazeSeasons,
  toonSlug,
  getTrembedUrl,
  getToonVideo
};
