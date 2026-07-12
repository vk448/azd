// Anikage.cc scraper — fetches servers + HLS sources from anikage.cc API
// Routes through megacloud.animanga.fun proxy

const PROXY_URL = "https://prox.anicore.tv";
const MEGACLOUD_PROXY = "https://megacloud.animanga.fun/proxy";
const API_BASE = "https://anikage.cc/api/media/anime";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://anikage.cc/",
  "Origin": "https://anikage.cc",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const PROXY_HEADERS = JSON.stringify({
  "User-Agent": HEADERS["User-Agent"],
  "Referer": "https://anikage.cc/",
  "Origin": "https://anikage.cc",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
});

function buildProxyUrl(token, type) {
  if (!token) return "";
  if (token.startsWith("http://") || token.startsWith("https://")) return token;
  var rawUrl = PROXY_URL + "/" + (type || "m3u8") + "/" + token;
  return MEGACLOUD_PROXY + "?url=" + encodeURIComponent(rawUrl) + "&headers=" + encodeURIComponent(PROXY_HEADERS);
}

async function getServers(slug, episode) {
  const url = `${API_BASE}/${slug}/episodes/${episode}/servers`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`Servers fetch failed: ${r.status}`);
  return await r.json();
}

async function getSources(slug, episode, provider, lang) {
  const url = `${API_BASE}/${slug}/episodes/${episode}/sources?provider=${provider}&lang=${lang}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`Sources fetch failed: ${r.status}`);
  return await r.json();
}

// Scrape neko and koto servers, return both
async function scrapeAnikage(slugOrId, episode) {
  const serversData = await getServers(slugOrId, episode);
  const servers = serversData.servers || [];

  const results = { neko: { sub: null, dub: null }, koto: { sub: null, dub: null }, serverList: servers.map(s => s.id) };
  const targetServers = ["neko", "koto"];

  for (const serverId of targetServers) {
    const server = servers.find(s => s.id === serverId);
    if (!server) continue;

    for (const lang of ["sub", "dub"]) {
      if (!server.subTypes.includes(lang)) continue;

      try {
        const srcData = await getSources(slugOrId, episode, serverId, lang);
        if (!srcData.sources || srcData.sources.length === 0) continue;

        let bestSource = null;
        const softsubs = srcData.sources.filter(s => s.type === "softsub" && s.isM3U8);
        const hardsubs = srcData.sources.filter(s => s.type === "hardsub" && s.isM3U8);
        const dubs = srcData.sources.filter(s => s.type === "dub" && s.isM3U8);
        const allM3u8 = srcData.sources.filter(s => s.isM3U8);

        if (lang === "dub" && dubs.length > 0) bestSource = dubs[0];
        else if (softsubs.length > 0) bestSource = softsubs[0];
        else if (hardsubs.length > 0) bestSource = hardsubs[0];
        else if (allM3u8.length > 0) bestSource = allM3u8[0];

        if (!bestSource) continue;

        const m3u8Url = buildProxyUrl(bestSource.url, "m3u8");
        const tracks = (srcData.subtitles || []).map(sub => ({
          file: buildProxyUrl(sub.file, "m3u8"),
          label: sub.label,
          kind: sub.kind,
          default: sub.default,
        }));

        if (bestSource.embedUrl && bestSource.embedUrl.includes("sub=")) {
          const subMatch = bestSource.embedUrl.match(/sub=([^&]+)/);
          if (subMatch && tracks.length === 0) {
            tracks.push({ file: decodeURIComponent(subMatch[1]), label: "English", kind: "captions", default: true });
          }
        }

        results[serverId][lang] = {
          m3u8: m3u8Url,
          tracks,
          intro: srcData.intro || { start: 0, end: 0 },
          outro: srcData.outro || { start: 0, end: 0 },
          server: serverId,
          source: bestSource.type,
          quality: bestSource.quality,
          allSources: srcData.sources.map(s => ({
            url: buildProxyUrl(s.url, "m3u8"),
            quality: s.quality,
            type: s.type,
            embedUrl: s.embedUrl,
          })),
        };
      } catch (e) {}
    }
  }

  return results;
}

module.exports = { scrapeAnikage, getServers, getSources, buildProxyUrl, PROXY_URL };
