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
