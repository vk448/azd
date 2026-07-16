const http = require("http");
const fs = require("fs");
const path = require("path");
const { scrapeBoth } = require("./megaplay-scraper");
const { getDownloadLinks } = require("./download");
const { scrapeAnikage } = require("./anikage-scraper");

const PORT = 5500;
const PLAYER_HTML = fs.readFileSync(path.join(__dirname, "megaplayer.html"), "utf8");
const DOWNLOAD_HTML = fs.readFileSync(path.join(__dirname, "download.html"), "utf8");

const CDN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Referer": "https://megaplay.buzz/",
  "Origin": "https://megaplay.buzz",
};

const ANIKAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://anikage.cc/",
  "Origin": "https://anikage.cc",
  "Accept": "application/json, text/plain, */*",
};
const ANIKAGE_API = "https://anikage.cc/api/media/anime";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res, content, status = 200) {
  cors(res);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(content);
}

function compactHash(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function decodeHash(hash) {
  try { return JSON.parse(Buffer.from(hash, "base64").toString()); } catch { return {}; }
}

async function proxyFetch(url, opts = {}) {
  const u = new URL(url);
  let headers = { ...CDN_HEADERS };
  if (u.hostname.includes("anicore.tv") || u.hostname.includes("anikage.cc") || u.hostname.includes("anizara.store")) {
    headers = { ...ANIKAGE_HEADERS };
  }
  const r = await fetch(url, { headers: { ...headers, ...opts.headers } });
  return r;
}

function rewriteM3u8(content, baseUrl, serverHost) {
  const lines = content.split("\n");
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    let absUrl = trimmed;
    if (!trimmed.startsWith("http")) {
      absUrl = trimmed.startsWith("/") ? new URL(trimmed, new URL(baseUrl).origin).href : baseDir + trimmed;
    }
    return serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(absUrl);
  }).join("\n");
}

function makeEmbedEntry(cfg) {
  const hash = compactHash(cfg);
  return { ...cfg, embedUrl: cfg.source === "anikage" ? `/api/ak/embed/${hash}` : `/api/watch-embed/${hash}` };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  const fullUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const url = decodeURIComponent(fullUrl.pathname);

  try {
    // GET /api/anime-embed/:anilistId/episode/:episode — AniList ID primary, fetches MAL ID
    const embedMatch = url.match(/^\/api\/anime-embed\/(\d+)\/episode\/(\d+)$/);
    if (embedMatch) {
      const anilistId = Number(embedMatch[1]);
      const episode = Number(embedMatch[2]);

      let animeTitle = "", malId = null, synonyms = [];
      try {
        const gql = JSON.stringify({ query: `{ Media(id:${anilistId},type:ANIME){ id title{romaji english native} idMal synonyms } }` });
        const r = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: gql });
        const d = await r.json();
        const m = d.data && d.data.Media;
        if (m) {
          malId = m.idMal;
          animeTitle = (m.title && (m.title.english || m.title.romaji || m.title.native)) || "";
          synonyms = m.synonyms || [];
        }
      } catch {}

      if (!animeTitle) {
        try {
          const r = await fetch(`${ANIKAGE_API}/${anilistId}`, { headers: ANIKAGE_HEADERS });
          if (r.ok) {
            const d = await r.json();
            const t = d.anime && d.anime.title;
            animeTitle = (t && (t.english || t.romaji || t.userPreferred || t.native)) || "";
          }
        } catch {}
      }

      const result = { ok: true, anilist_id: anilistId, mal_id: malId, episode, title: animeTitle, megaplay: [], anikage: [] };

      // Megaplay sources (needs MAL ID)
      if (malId) {
        try {
          const sources = await scrapeBoth(malId, episode);
          for (const lang of ["sub", "dub"]) {
            if (sources[lang]) {
              const s = sources[lang];
              const cfg = { source: "megaplay", type: lang, m3u8: s.m3u8, tracks: s.tracks || [], intro: s.intro || null, outro: s.outro || null, title: animeTitle };
              result.megaplay.push(makeEmbedEntry(cfg));
            }
          }
        } catch {}

        try {
          const dl = await getDownloadLinks(malId, episode);
          result.downloads = dl;
        } catch {}
      }

      // Anikage sources (uses AniList ID directly)
      try {
        const akSources = await scrapeAnikage(anilistId, episode);
        for (const serverName of ["neko", "koto"]) {
          const srv = akSources[serverName];
          if (!srv) continue;
          for (const lang of ["sub", "dub"]) {
            if (srv[lang]) {
              const s = srv[lang];
              const cfg = {
                source: "anikage", type: lang, server: serverName, quality: s.quality,
                label: `${animeTitle} ${lang.toUpperCase()} (${serverName})`,
                m3u8: s.m3u8, tracks: s.tracks || [],
                intro: s.intro || null, outro: s.outro || null, title: animeTitle,
              };
              result.anikage.push(makeEmbedEntry(cfg));
            }
          }
        }
      } catch {}

      return json(res, result);
    }

    // GET /api/ak/embed/:hash — anikage player page
    const akEmbedMatch = url.match(/^\/api\/ak\/embed\/([A-Za-z0-9+/=]+)$/);
    if (akEmbedMatch) {
      const config = decodeHash(akEmbedMatch[1]);
      const host = req.headers.host || "localhost";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const serverHost = `${proto}://${host}`;

      config.m3u8 = `${serverHost}/api/proxy/m3u8?url=${encodeURIComponent(config.m3u8)}`;
      if (config.tracks) {
        config.tracks = config.tracks.map(t => ({
          ...t,
          file: `${serverHost}/api/proxy/m3u8?url=${encodeURIComponent(t.file)}`,
        }));
      }

      const playerPage = PLAYER_HTML.replace(
        "</head>",
        `<script>window.__PLAYER_CONFIG__=${JSON.stringify(config)};</script></head>`
      );
      return html(res, playerPage);
    }

    // GET /api/watch-embed/:hash — megaplay player page
    const watchMatch = url.match(/^\/api\/watch-embed\/([A-Za-z0-9+/=]+)$/);
    if (watchMatch) {
      const config = decodeHash(watchMatch[1]);
      const host = req.headers.host || "localhost";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const serverHost = `${proto}://${host}`;

      config.m3u8 = `${serverHost}/api/proxy/m3u8?url=${encodeURIComponent(config.m3u8)}`;
      if (config.tracks) {
        config.tracks = config.tracks.map(t => ({
          ...t,
          file: `${serverHost}/api/proxy/m3u8?url=${encodeURIComponent(t.file)}`,
        }));
      }

      const playerPage = PLAYER_HTML.replace(
        "</head>",
        `<script>window.__PLAYER_CONFIG__=${JSON.stringify(config)};</script></head>`
      );
      return html(res, playerPage);
    }

    // GET /api/download/:anilistId/episode/:episode (download page)
    const dlMatch = url.match(/^\/api\/download\/(\d+)\/episode\/(\d+)$/);
    if (dlMatch) {
      const anilistId = Number(dlMatch[1]);
      const episode = Number(dlMatch[2]);

      let malId = null, animeTitle = "Unknown", image = "";
      try {
        const gql = JSON.stringify({ query: `{ Media(id:${anilistId},type:ANIME){ idMal title{romaji english} coverImage{large} } }` });
        const r = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: gql });
        const d = await r.json();
        const m = d.data && d.data.Media;
        if (m) {
          malId = m.idMal;
          animeTitle = (m.title && (m.title.english || m.title.romaji)) || "Unknown";
          image = m.coverImage && m.coverImage.large || "";
        }
      } catch {}

      let downloads = { sub: [], dub: [] };
      if (malId) {
        try { downloads = await getDownloadLinks(malId, episode); } catch {}
      }

      const dlData = { title: animeTitle, image, episode, sub: downloads.sub || [], dub: downloads.dub || [] };
      const dlPage = DOWNLOAD_HTML.replace("</head>", `<script>window.__DL_DATA__=${JSON.stringify(dlData)};</script></head>`);
      return html(res, dlPage);
    }

    // GET /api/proxy/m3u8?url=X
    if (url === "/api/proxy/m3u8") {
      const targetUrl = fullUrl.searchParams.get("url");
      if (!targetUrl) {
        res.writeHead(400);
        return res.end("Missing url param");
      }

      const r = await proxyFetch(targetUrl);
      const contentType = r.headers.get("content-type") || "";
      const isM3u8 = contentType.includes("mpegurl") || targetUrl.includes(".m3u8") || targetUrl.endsWith(".m3u8");

      cors(res);

      if (!r.ok) {
        res.writeHead(r.status, { "Content-Type": contentType || "text/plain" });
        const err = await r.text();
        return res.end(err);
      }

      if (isM3u8) {
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
        const body = await r.text();
        const host = req.headers.host || "localhost";
        const proto = req.headers["x-forwarded-proto"] || "http";
        const serverHost = `${proto}://${host}`;
        return res.end(rewriteM3u8(body, targetUrl, serverHost));
      }

      const buf = Buffer.from(await r.arrayBuffer());
      var ct = contentType || "application/octet-stream";
      if (targetUrl.includes(".vtt") || targetUrl.includes("/subtitles/")) ct = "text/vtt; charset=utf-8";
      else if (targetUrl.includes(".ts")) ct = "video/mp2t";
      res.writeHead(200, { "Content-Type": ct });
      res.end(buf);
      return;
    }

    // GET /api/watch/megaplay/:anilistId/:episode/:lang
    const watchMegaMatch = url.match(/^\/api\/watch\/megaplay\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchMegaMatch) {
      const wAnilistId = Number(watchMegaMatch[1]);
      const wEpisode = Number(watchMegaMatch[2]);
      const wLang = watchMegaMatch[3];
      let wMalId = null, wTitle = "";
      try {
        const wGql = JSON.stringify({ query: "{ Media(id:" + wAnilistId + ",type:ANIME){ idMal title{romaji english} } }" });
        const wGr = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: wGql });
        const wGd = await wGr.json();
        const wGm = wGd.data && wGd.data.Media;
        if (wGm) { wMalId = wGm.idMal; wTitle = (wGm.title && (wGm.title.english || wGm.title.romaji)) || ""; }
      } catch {}
      if (!wMalId) { res.writeHead(404); return res.end("MAL ID not found"); }
      const wSources = await scrapeBoth(wMalId, wEpisode);
      const wData = wSources[wLang];
      if (!wData) { res.writeHead(404); return res.end(wLang.toUpperCase() + " not available"); }
      const host = req.headers.host || "localhost";
      const proto = req.headers["x-forwarded-proto"] || "http";
      const sHost = `${proto}://${host}`;
      const wCfg = {
        m3u8: `${sHost}/api/proxy/m3u8?url=${encodeURIComponent(wData.m3u8)}&headers=${encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" }))}`,
        tracks: (wData.tracks || []).map(t => ({ ...t, file: `${sHost}/api/proxy/m3u8?url=${encodeURIComponent(t.file)}&headers=${encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" }))}` })),
        intro: wData.intro || null, outro: wData.outro || null, title: wTitle + " - Ep " + wEpisode
      };
      const wPage = PLAYER_HTML.replace("</head>", `<script>window.__PLAYER_CONFIG__=${JSON.stringify(wCfg)};</script></head>`);
      return html(res, wPage);
    }

    // GET /api/watch/ak/:anilistId/:episode/:lang
    const watchAkMatch = url.match(/^\/api\/watch\/ak\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchAkMatch) {
      const wAnilistId2 = Number(watchAkMatch[1]);
      const wEpisode2 = Number(watchAkMatch[2]);
      const wLang2 = watchAkMatch[3];
      let wTitle2 = "";
      try {
        const wGql2 = JSON.stringify({ query: "{ Media(id:" + wAnilistId2 + ",type:ANIME){ title{romaji english} } }" });
        const wGr2 = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: wGql2 });
        const wGd2 = await wGr2.json();
        const wGm2 = wGd2.data && wGd2.data.Media;
        if (wGm2) wTitle2 = (wGm2.title && (wGm2.title.english || wGm2.title.romaji)) || "";
      } catch {}
      const wAkSources = await scrapeAnikage(wAnilistId2, wEpisode2);
      let wAkData = null;
      const targetServers = ["neko", "koto"];
      for (const srvName of targetServers) {
        const srv = wAkSources[srvName];
        if (srv && srv[wLang2]) { wAkData = srv[wLang2]; break; }
      }
      if (!wAkData) { res.writeHead(404); return res.end(wLang2.toUpperCase() + " not available"); }
      const host2 = req.headers.host || "localhost";
      const proto2 = req.headers["x-forwarded-proto"] || "http";
      const sHost2 = `${proto2}://${host2}`;
      const ANI_H = encodeURIComponent(JSON.stringify({ "User-Agent": "Mozilla/5.0", "Referer": "https://anikage.cc/", "Origin": "https://anikage.cc", "Accept": "*" }));
      const wrapAni = (u) => `https://megacloud.animanga.fun/proxy?url=${encodeURIComponent(u)}&headers=${ANI_H}`;
      const wCfg2 = {
        m3u8: `${sHost2}/api/proxy/m3u8?url=${encodeURIComponent(wrapAni(wAkData.m3u8))}`,
        tracks: (wAkData.tracks || []).map(t => ({ ...t, file: `${sHost2}/api/proxy/m3u8?url=${encodeURIComponent(wrapAni(t.file))}` })),
        intro: wAkData.intro || null, outro: wAkData.outro || null, title: wTitle2 + " - Ep " + wEpisode2
      };
      const wPage2 = PLAYER_HTML.replace("</head>", `<script>window.__PLAYER_CONFIG__=${JSON.stringify(wCfg2)};</script></head>`);
      return html(res, wPage2);
    }

    // GET /api/health
    if (url === "/api/health") {
      return json(res, { ok: true, time: Date.now() });
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    json(res, { ok: false, error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log(`  GET /api/anime-embed/:anilistId/episode/:episode`);
  console.log(`  GET /api/watch-embed/:hash`);
  console.log(`  GET /api/ak/embed/:hash`);
  console.log(`  GET /api/download/:anilistId/episode/:episode`);
  console.log(`  GET /api/proxy/m3u8?url=X`);
});
