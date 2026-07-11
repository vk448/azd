const config = require("./config");
const { detectLangCode } = require("./utils");
const { nodeFetch } = require("./fetchers");

const {
  UA, MEGAPLAY_BASE, ANIZONE_BASE, ANIKAGE_BASE,
  ANIZONE_HEADERS, ANIKAGE_HEADERS, ANIKOTO_API,
  MEGAPLAY_HEADERS, AK_XOR_KEY
} = config;

async function anikotoSearchByMal(malId) {
  const r = await fetch(`${ANIKOTO_API}/recent-anime?page=1&per_page=50`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("Anikoto API error");
  const d = await r.json();
  if (!d.ok) throw new Error("Anikoto API failed");
  const found = d.data.find(a => String(a.mal_id) === String(malId));
  if (!found) return null;
  return found;
}

async function anikotoGetEpisodes(anikotoId) {
  const r = await fetch(`${ANIKOTO_API}/series/${anikotoId}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("Anikoto series error");
  const d = await r.json();
  if (!d.ok) throw new Error("Anikoto series failed");
  return d.data;
}

async function megaplayGetM3u8(streamUrl) {
  const r1 = await fetch(streamUrl, { headers: { "User-Agent": UA, "Referer": MEGAPLAY_BASE + "/", "Accept": "text/html" }, redirect: "follow" });
  const html = await r1.text();
  const titleMatch = html.match(/<title>File\s+(\d+)/i);
  if (!titleMatch) throw new Error("No file ID found on megaplay page");
  const fileId = titleMatch[1];
  const parsed = new URL(streamUrl);
  const base = parsed.origin;
  const apiR = await fetch(`${base}/stream/getSources?id=${fileId}`, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": streamUrl,
      "Origin": base
    }
  });
  if (!apiR.ok) throw new Error("getSources API error: " + apiR.status);
  const data = await apiR.json();
  let m3u8 = null;
  if (data.sources) {
    if (typeof data.sources === "object" && data.sources.file) m3u8 = data.sources.file;
    else if (Array.isArray(data.sources)) {
      for (const s of data.sources) { if (s.file && s.file.includes(".m3u8")) { m3u8 = s.file; break; } }
    }
  }
  if (!m3u8 && data.file && String(data.file).includes(".m3u8")) m3u8 = data.file;
  return { m3u8, tracks: data.tracks || [], intro: data.intro || null, outro: data.outro || null, fileId };
}

async function extractMegaPlayByMal(malId, episode, type) {
  const streamUrl = `${MEGAPLAY_BASE}/stream/mal/${malId}/${episode}/${type}`;
  return { ...await megaplayGetM3u8(streamUrl), streamUrl };
}

// ====== AniZone Helpers ======

async function anizoneSearch(query) {
  const r = await nodeFetch(`${ANIZONE_BASE}/anime?search=${encodeURIComponent(query)}`, ANIZONE_HEADERS);
  if (!r.ok) return [];
  const html = await r.text();
  const results = [];
  const cardRegex = /anmTitles:\s*JSON\.parse\('([^']+)'\)[\s\S]*?href="https:\/\/anizone\.to\/anime\/([a-z0-9]{8})/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    try {
      const titles = JSON.parse(match[1].replace(/\\u0022/g, '"').replace(/\\u005C/g, '\\'));
      const slug = match[2];
      const engTitle = titles["1"] || titles["2"] || Object.values(titles)[0] || "";
      if (engTitle && !results.find(r => r.slug === slug)) {
        results.push({ slug, title: engTitle, nativeTitle: titles["8"] || "" });
      }
    } catch {}
  }
  return results;
}

async function anizoneFetchEpisode(slug, episode) {
  const r = await nodeFetch(`${ANIZONE_BASE}/anime/${slug}/${episode}`, ANIZONE_HEADERS);
  if (!r.ok) throw new Error("AniZone episode fetch failed: " + r.status);
  return await r.text();
}

function anizoneParseEpisode(html, slug, episode) {
  const m3u8Match = html.match(/<media-player[^>]+src="(https:\/\/[^"]+\.m3u8)"/i);
  if (!m3u8Match) throw new Error("No m3u8 URL found on AniZone page");
  const videoUrl = m3u8Match[1];
  const tracks = [];
  const trackRegex = /<track\s+src=(https:\/\/[^\s>]+(?:\.(?:vtt|ass))?)[^>]*label="([^"]*)"[^>]*srclang="([^"]*)"[^>]*(?:default)?/gi;
  let tMatch;
  while ((tMatch = trackRegex.exec(html)) !== null) {
    tracks.push({
      file: tMatch[1].trim(),
      label: tMatch[2].trim(),
      srclang: tMatch[3].trim(),
      kind: "subtitles",
      default: tMatch[0].includes("default")
    });
  }
  const titleMatch = html.match(/window\.getTitle\([^,]+,\s*'([^']+)'\)/);
  const title = titleMatch ? titleMatch[1] : `Anime ${slug}`;
  return { videoUrl, tracks, title, slug, episode };
}

async function anizoneSearchByTitle(title) {
  const results = await anizoneSearch(title);
  if (!results.length) return null;
  const q = title.toLowerCase().trim();
  let best = results.find(r => r.title.toLowerCase() === q);
  if (!best) best = results.find(r => r.title.toLowerCase().includes(q) || q.includes(r.title.toLowerCase()));
  if (!best) best = results[0];
  return best;
}

async function anizoneExtract(title, episode) {
  const found = await anizoneSearchByTitle(title);
  if (!found) throw new Error("Anime not found on AniZone");
  const html = await anizoneFetchEpisode(found.slug, episode);
  return anizoneParseEpisode(html, found.slug, episode);
}

// ====== AniKage Helpers ======

async function anikageGetServers(anilistId, episode) {
  const r = await nodeFetch(`${ANIKAGE_BASE}/api/media/anime/${anilistId}/episodes/${episode}/servers`, ANIKAGE_HEADERS);
  if (!r.ok) throw new Error("AniKage servers fetch failed: " + r.status);
  return await r.json();
}

async function anikageGetSources(anilistId, episode, server, type) {
  const r = await nodeFetch(`${ANIKAGE_BASE}/api/media/anime/${anilistId}/episodes/${episode}/sources?server=${server}&type=${type}&provider=${server}`, ANIKAGE_HEADERS);
  if (!r.ok) throw new Error("AniKage sources fetch failed: " + r.status);
  return await r.json();
}

function anikageSubFromEmbedUrl(embedUrl) {
  if (!embedUrl) return null;
  try { return new URL(embedUrl).searchParams.get("sub"); } catch { return null; }
}

function anikageDecrypt(encoded) {
  try {
    const raw = atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ AK_XOR_KEY.charCodeAt(i % AK_XOR_KEY.length);
    const dec = new TextDecoder().decode(bytes);
    return dec.split("\0")[0];
  } catch { return null; }
}

async function anikageExtract(anilistId, episodeNum, audioType) {
  const serversData = await anikageGetServers(anilistId, episodeNum);
  const servers = serversData.servers || [];
  if (!servers.length) throw new Error("No servers available on AniKage");

  // Sort: neko first, then default, then rest
  const sorted = [...servers].sort((a, b) => {
    if (a.id === "neko") return -1;
    if (b.id === "neko") return 1;
    if (a.default) return -1;
    if (b.default) return 1;
    return 0;
  });

  let lastErr = null;
  for (const srv of sorted) {
    try {
      const sources = await anikageGetSources(anilistId, episodeNum, srv.id, audioType);
      let m3u8 = null;
      for (const src of sources.sources || []) {
        const dec = anikageDecrypt(src.url);
        if (dec && dec.includes(".m3u8")) { m3u8 = dec; break; }
      }
      if (!m3u8) { lastErr = new Error("No m3u8 on server " + srv.id); continue; }

      const tracks = (sources.subtitles || []).map(t => {
        let subUrl = (t.file && t.file.startsWith("http")) ? t.file : null;
        if (!subUrl) subUrl = anikageDecrypt(t.file);
        if (!subUrl) subUrl = anikageSubFromEmbedUrl(t.embedUrl);
        if (!subUrl) console.warn("AniKage subtitle drop: no valid URL found for", t.label, t.srclang || t.lang);
        const label = t.label || "English";
        const srclang = t.srclang || t.lang || detectLangCode(label);
        return { file: subUrl || "", label, srclang, kind: "captions", default: t.default || false };
      }).filter(t => t.file);

      return {
        videoUrl: m3u8,
        tracks,
        server: srv.id,
        servers: servers,
        embeds: sources.embeds || [],
        embedOptions: sources.embedOptions || [],
        intro: sources.intro || null,
        outro: sources.outro || null,
        fromScrape: false
      };
    } catch (e) {
      console.warn("AniKage server " + srv.id + " failed:", e.message);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All AniKage servers failed");
}

module.exports = {
  anikotoSearchByMal, anikotoGetEpisodes, megaplayGetM3u8, extractMegaPlayByMal,
  anizoneSearch, anizoneFetchEpisode, anizoneParseEpisode, anizoneSearchByTitle, anizoneExtract,
  anikageGetServers, anikageGetSources, anikageSubFromEmbedUrl, anikageDecrypt, anikageExtract
};
