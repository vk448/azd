const { spawn } = require("child_process");
const https = require("https");

// Import split modules
const config = require("./config");
const { detectLangCode, stableHash, encodeHash, decodeHash } = require("./utils");
const {
  anilistQuery, slugify, jikanInfo, getEpCountFrom9Anime,
  detectSeasonFromMalId, findMalId, ajaxDL, parseDL, getImg,
  nodeFetch, directFetch, proxyFetch
} = require("./fetchers");
const {
  anikotoSearchByMal, anikotoGetEpisodes, megaplayGetM3u8, extractMegaPlayByMal,
  anizoneSearch, anizoneFetchEpisode, anizoneParseEpisode, anizoneSearchByTitle, anizoneExtract,
  anikageGetServers, anikageGetSources, anikageSubFromEmbedUrl, anikageDecrypt, anikageExtract
} = require("./extractors");
const {
  getTvdbToken, getCoverImage, makeBtn, renderError, renderUnavailable,
  renderPage, renderWatch, renderEmbed, renderPlayer, renderSeason,
  renderEmbedOnly, renderMegaPlayer
} = require("./renderers");
const {
  loadAnimeCache, findAnimeByTitle, getTvmazeSeasons, toonSlug, getTrembedUrl, getToonVideo
} = require("./toonstream");

const {
  BASE, AJAX, JIKAN, ANILIST, UA, PROXY_BASE, keepAliveAgent,
  anilistCache, ANILIST_CACHE_TTL, anilistLastCall,
  ANIME_CACHE, CACHE_TIME,
  hashStore, m3u8Store, akLookup, streamCache, CACHE_TTL,
  cacheGet, cacheSet, m3u8Get, m3u8Set,
  MEGAPLAY_BASE, MEGAPLAY_HEADERS, ANIZONE_BASE, ANIZONE_HEADERS,
  ANIKAGE_BASE, ANIKAGE_HEADERS, AK_XOR_KEY,
  TVDB_TOKEN, TVDB_TOKEN_TIME, SHARED_BG, ANIKOTO_API
} = config;

module.exports = async (req, res) => {
  const ERR_MSG = "Invalid or non-existent MAL ID. Please check the MAL ID and try again.";
  const ERR_404 = "This anime was not found on our source. It may not have episodes uploaded yet.";

  // CORS - allow all origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Range, Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, "");

    // Secure m3u8 Proxy (hides real URL via token): /api/mpxs/{hash}
    const mpxsMatch = path.match(/^\/api\/mpxs\/([\w-]+)$/);
    if (mpxsMatch) {
      const hash = mpxsMatch[1];
      let targetUrl = null;
      // Stateless mode: decode base64url-encoded URL from hash
      const decoded = decodeHash(hash);
      if (decoded && decoded.u) {
        targetUrl = decoded.u;
      } else {
        // Stateful fallback: look up hash in store
        const entry = m3u8Get(hash);
        if (!entry) return res.status(404).json({ error: "Invalid or expired token" });
        targetUrl = typeof entry === 'string' ? entry : entry.url;
      }
      const targetOrigin = (() => { try { return new URL(targetUrl).origin; } catch { return ""; } })();
      const proxyHeaders = {
        "User-Agent": UA,
        "Referer": targetOrigin + "/",
        "Origin": targetOrigin,
        "Accept": "*/*"
      };
      if (req.headers.range) proxyHeaders["Range"] = req.headers.range;
      try {
        const r = await fetch(targetUrl, { headers: proxyHeaders, redirect: "follow" });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream " + r.status });
        const ct = r.headers.get("content-type") || "application/octet-stream";
        if (ct.includes("mpegurl") || targetUrl.split("?")[0].endsWith(".m3u8")) {
          const body = await r.text();
          const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          function absUrl(p, t, b) { return p.startsWith("http") ? p : (p.startsWith("/") ? new URL(t).origin + p : b + p); }
          const rewritten = body.replace(/^(?!#)([^\s].+)$/gm, (line) => {
            const abs = absUrl(line, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = encodeHash({u: abs});
              return "/api/mpxs/" + h;
            }
            return "/api/mpxy?url=" + encodeURIComponent(abs);
          }).replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = absUrl(uri, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = encodeHash({u: abs});
              return 'URI="/api/mpxs/' + h + '"';
            }
            return 'URI="/api/mpxy?url=' + encodeURIComponent(abs) + '"';
          });
          res.setHeader("Content-Type", "application/x-mpegURL");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
          return res.send(rewritten);
        }
        res.setHeader("Content-Type", ct);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const cr = r.headers.get("content-range");
        if (cr) res.setHeader("Content-Range", cr);
        const ar = r.headers.get("accept-ranges");
        if (ar) res.setHeader("Accept-Ranges", ar);
        const buffer = Buffer.from(await r.arrayBuffer());
        res.statusCode = r.status;
        return res.send(buffer);
      } catch (e) {
        return res.status(500).json({ error: "Proxy error: " + e.message });
      }
    }

    // MegaPlay CDN Proxy: /api/mpxy?url=
    if (path === "/api/mpxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).json({ error: "Invalid URL" });
      }
      const targetOrigin = (() => { try { return new URL(targetUrl).origin; } catch { return ""; } })();
      const proxyHeaders = {
        "User-Agent": UA,
        "Referer": targetOrigin + "/",
        "Origin": targetOrigin,
        "Accept": "*/*"
      };
      if (req.headers.range) proxyHeaders["Range"] = req.headers.range;
      try {
        const r = await fetch(targetUrl, { headers: proxyHeaders, redirect: "follow" });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream " + r.status });
        const ct = r.headers.get("content-type") || "application/octet-stream";

        if (ct.includes("mpegurl") || targetUrl.split("?")[0].endsWith(".m3u8")) {
          const body = await r.text();
          const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          function absUrl(p, t, b) { return p.startsWith("http") ? p : (p.startsWith("/") ? new URL(t).origin + p : b + p); }
          const rewritten = body.replace(/^(?!#)([^\s].+)$/gm, (line) => {
            const abs = absUrl(line, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = encodeHash({u: abs});
              return "/api/mpxs/" + h;
            }
            return "/api/mpxy?url=" + encodeURIComponent(abs);
          }).replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = absUrl(uri, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = encodeHash({u: abs});
              return 'URI="/api/mpxs/' + h + '"';
            }
            return 'URI="/api/mpxy?url=' + encodeURIComponent(abs) + '"';
          });
          res.setHeader("Content-Type", "application/x-mpegURL");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
          return res.send(rewritten);
        }

        res.setHeader("Content-Type", ct);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const cr = r.headers.get("content-range");
        if (cr) res.setHeader("Content-Range", cr);
        const ar = r.headers.get("accept-ranges");
        if (ar) res.setHeader("Accept-Ranges", ar);
        const buffer = Buffer.from(await r.arrayBuffer());
        res.statusCode = r.status;
        return res.send(buffer);
      } catch (e) {
        return res.status(500).json({ error: "Proxy error: " + e.message });
      }
    }

    // HLS Proxy: /api/proxy.m3u8?url=... (for m3u8 playlists)
    if (path === "/api/proxy.m3u8") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).json({ error: "Invalid URL" });
      }
      try {
        const r = await fetch(targetUrl, {
          headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" }
        });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });
        const body = await r.text();

        const urlObj = new URL(targetUrl);
        const cdnOrigin = urlObj.origin;
        const masterDir = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

        // Rewrite URI="..." entries
        let rewritten = body.replace(/(URI=")([^"]+)(")/g, (match, pre, uri, post) => {
          let full;
          if (uri.startsWith("http")) full = uri;
          else if (uri.startsWith("/")) full = cdnOrigin + uri;
          else full = masterDir + uri;
          return pre + "/api/proxy.m3u8?url=" + encodeURIComponent(full) + post;
        });

        // Rewrite bare segment/variant URLs (lines that are just URLs, not #comments)
        rewritten = rewritten.replace(/^(?!#)(https?:\/\/[^\s]+)$/gm, (line) => {
          return "/api/seg?url=" + encodeURIComponent(line.trim());
        }).replace(/^(?!#)(\/hls\/[^\s]+)$/gm, (line) => {
          return "/api/proxy.m3u8?url=" + encodeURIComponent(cdnOrigin + line.trim());
        });

        res.setHeader("Content-Type", "application/x-mpegURL");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        return res.send(rewritten);
      } catch (e) {
        return res.status(500).json({ error: "Proxy error: " + e.message });
      }
    }

    // Segment Proxy: /api/seg?url=... (for video segments)
    if (path === "/api/seg") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).json({ error: "Invalid URL" });
      }
      try {
        const r = await fetch(targetUrl, {
          headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" }
        });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });

        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const buffer = Buffer.from(await r.arrayBuffer());
        return res.send(buffer);
      } catch (e) {
        return res.status(500).json({ error: "Segment error: " + e.message });
      }
    }

    const seasonMatch = path.match(/^\/api\/mal\/(\d+)\/season$/);
    if (seasonMatch) {
      const mid = parseInt(seasonMatch[1]);
      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_MSG)); }
      const name = info.eng || info.title;
      const found = await findMalId(name);
      if (!found.malId) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_404));
      const img = info.image || (await getImg(name, 1));
      let hasAnyDl = false;
      try {
        const dl = await ajaxDL(found.malId, 1);
        if (dl?.data && dl.data.status === 200) {
          const dls = parseDL(dl.data.result || "");
          if (dls.sub.length > 0 || dls.dub.length > 0) hasAnyDl = true;
        }
      } catch {}
      if (!hasAnyDl) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderUnavailable(name, "all", img));
      }
      const totalEps = info.episodes || found.epCount || 12;
      const html = renderSeason(name, img, totalEps, found.malId);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    const malMatch = path.match(/^\/api\/mal\/(\d+)\/page$/);
    if (malMatch) {
      const mid = parseInt(malMatch[1]);
      const ep = parseInt(url.searchParams.get("episode") || "1");
      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_MSG)); }
      const name = info.eng || info.title;
      const found = await findMalId(name);
      if (!found.malId) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_404));
      let subUrl = "", dubUrl = "";
      const dl = await ajaxDL(found.malId, ep);
      if (dl?.data && dl.data.status === 200) {
        const dls = parseDL(dl.data.result || "");
        subUrl = dls.sub[0]?.url || "";
        dubUrl = dls.dub[0]?.url || "";
      }
      const img = await getImg(name, ep);
      if (!subUrl && !dubUrl) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderUnavailable(name, ep, img));
      }
      const html = renderPage(name, ep, img, subUrl, dubUrl);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    const malJson = path.match(/^\/api\/mal\/(\d+)$/);
    if (malJson) {
      const mid = parseInt(malJson[1]);
      const ep = parseInt(url.searchParams.get("episode") || "1");
      let info;
      try { info = await jikanInfo(mid); } catch { return res.status(400).json({ error: ERR_MSG }); }
      const name = info.eng || info.title;
      const found = await findMalId(name);
      if (!found.malId) return res.status(404).json({ error: ERR_404 });
      const dl = await ajaxDL(found.malId, ep);
      if (!dl?.data || dl.data.status !== 200) return res.status(404).json({ error: "No download links available for this episode." });
      const dls = parseDL(dl.data.result || "");
      return res.status(200).json({ anime: name, episode: ep, mal_id: found.malId, downloads: { subtitled: dls.sub, dubbed: dls.dub } });
    }

    if (path === "/api/page") {
      const title = url.searchParams.get("title");
      const ep = parseInt(url.searchParams.get("episode") || "1");
      if (!title) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError("Please provide a valid anime title."));
      const found = await findMalId(title);
      if (!found.malId) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_404));
      let subUrl = "", dubUrl = "";
      const dl = await ajaxDL(found.malId, ep);
      if (dl?.data && dl.data.status === 200) {
        const dls = parseDL(dl.data.result || "");
        subUrl = dls.sub[0]?.url || "";
        dubUrl = dls.dub[0]?.url || "";
      }
      const img = await getImg(title, ep);
      if (!subUrl && !dubUrl) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderUnavailable(title, ep, img));
      }
      const html = renderPage(title, ep, img, subUrl, dubUrl);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    if (path === "/api" || path === "/api/mal") {
      const mid = parseInt(url.searchParams.get("mal_id"));
      const ep = parseInt(url.searchParams.get("episode") || "1");
      if (!mid) return res.status(400).json({ error: ERR_MSG });
      let info;
      try { info = await jikanInfo(mid); } catch { return res.status(400).json({ error: ERR_MSG }); }
      const name = info.eng || info.title;
      const found = await findMalId(name);
      if (!found.malId) return res.status(404).json({ error: ERR_404 });
      const dl = await ajaxDL(found.malId, ep);
      if (!dl?.data || dl.data.status !== 200) return res.status(404).json({ error: "No download links available for this episode." });
      const dls = parseDL(dl.data.result || "");
      return res.status(200).json({ anime: name, episode: ep, mal_id: found.malId, downloads: { subtitled: dls.sub, dubbed: dls.dub } });
    }

    // ToonStream API: /api/toonstream/:mal_id
    const toonMatch = path.match(/^\/api\/toonstream\/(\d+)$/);
    if (toonMatch) {
      const mid = parseInt(toonMatch[1]);
      const season = parseInt(url.searchParams.get("season") || "0");
      const ep = parseInt(url.searchParams.get("episode") || "0");

      let info;
      try { info = await jikanInfo(mid); } catch { return res.status(400).json({ error: "Invalid MAL ID" }); }
      const title = info.title;

      // Find anime in cache (has TMDB season data)
      const cached = await findAnimeByTitle(title);
      let seasons = [];

      if (cached?.seasons) {
        // Use cached TMDB season data
        seasons = Object.values(cached.seasons).map(s => ({
          number: s.seasonNumber,
          name: "",
          episodes: s.totalEpisodes || 0,
          status: s.status || ""
        }));
      } else {
        // Fallback to TVmaze
        seasons = await getTvmazeSeasons(title);
      }

      const slug = toonSlug(title);

      // If episode specified, return single episode data
      if (season > 0 && ep > 0) {
        const pageUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
        const trembedUrl = await getTrembedUrl(pageUrl);
        if (!trembedUrl) {
          return res.status(404).json({ error: "Episode not found on ToonStream", episode_url: pageUrl });
        }
        const videoData = await getToonVideo(trembedUrl);
        return res.status(200).json({
          anime: title,
          mal_id: mid,
          season,
          episode: ep,
          page_url: pageUrl,
          trembed_url: trembedUrl,
          ...videoData
        });
      }

      // Return all seasons info
      return res.status(200).json({
        anime: title,
        mal_id: mid,
        slug,
        tmdb_id: cached?.originalTmdbId || null,
        seasons: seasons.map(s => ({
          season: s.number,
          name: s.name,
          episodes: s.episodes,
          status: s.status,
          base_url: `https://toonstream.vip/episode/${slug}-${s.number}x{episode}/`
        })),
        usage: "Add ?season=N&episode=N to get video data for a specific episode"
      });
    }

    // Watch page: /api/watch/:mal_id/:season/:episode
    const watchMatch = path.match(/^\/api\/watch\/(\d+)\/(\d+)\/(\d+)$/);
    if (watchMatch) {
      const mid = parseInt(watchMatch[1]);
      const season = parseInt(watchMatch[2]);
      const ep = parseInt(watchMatch[3]);

      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError("Invalid MAL ID")); }
      const title = info.title;

      // Get season data from cache or TVmaze
      const cached = await findAnimeByTitle(title);
      let tvmSeasons = [];
      if (cached?.seasons) {
        tvmSeasons = Object.values(cached.seasons).map(s => ({ number: s.seasonNumber, episodes: s.totalEpisodes || 0 }));
      } else {
        tvmSeasons = await getTvmazeSeasons(title);
      }

      const slug = toonSlug(title);

      const pageUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
      const trembedUrl = await getTrembedUrl(pageUrl);

      if (!trembedUrl) {
        return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(`Episode S${season}E${ep} not found on ToonStream`));
      }

      const videoData = await getToonVideo(trembedUrl);
      if (!videoData || videoData.error) {
        return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(videoData?.error || "Failed to load video"));
      }

      const curSeason = tvmSeasons.find(s => s.number === season) || {};
      const totalEps = curSeason.episodes || 25;
      const maxSeason = tvmSeasons.length ? Math.max(...tvmSeasons.map(s => s.number)) : season;

      global._watchMid = mid;
      global._watchTotalEps = totalEps;
      global._watchMaxSeason = maxSeason;

      const img = info.image || "";
      const html = renderWatch(title, season, ep, videoData.embed_url, img);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    // MegaPlay Player: /api/player/:mal_id/:season/:episode (3-param)
    const megaPlayer3 = path.match(/^\/api\/player\/(\d+)\/(\d+)\/(\d+)$/);
    if (megaPlayer3) {
      const mid = parseInt(megaPlayer3[1]);
      const ep = parseInt(megaPlayer3[3]);
      const type = url.searchParams.get("type") || "sub";
      try {
        const info = await jikanInfo(mid);
        const title = info.eng || info.title;
        let result = null;
        let videoUrl = null;

        // Source 1: MegaPlay
        try {
          console.log("[player] Trying MegaPlay for", mid, "ep", ep);
          const mp = await extractMegaPlayByMal(mid, ep, type);
          if (mp && mp.m3u8) { result = mp; videoUrl = mp.m3u8; console.log("[player] MegaPlay OK"); }
        } catch (e) { console.log("[player] MegaPlay failed:", e.message); }

        // Source 2: AniZone
        if (!videoUrl) {
          try {
            console.log("[player] Trying AniZone for", title);
            const az = await anizoneExtract(title, ep);
            if (az && az.videoUrl) { result = { m3u8: az.videoUrl, tracks: az.tracks || [], intro: null, outro: null }; videoUrl = az.videoUrl; console.log("[player] AniZone OK"); }
          } catch (e) { console.log("[player] AniZone failed:", e.message); }
        }

        // Source 3: AniKage (tries all servers internally)
        if (!videoUrl) {
          try {
            const anilistId = await findAnilistIdByTitle(title, mid);
            if (anilistId) {
              console.log("[player] Trying AniKage for", anilistId, "ep", ep);
              const ak = await anikageExtract(anilistId, ep, type);
              if (ak && ak.videoUrl) { result = { m3u8: ak.videoUrl, tracks: ak.tracks || [], intro: ak.intro || null, outro: ak.outro || null }; videoUrl = ak.videoUrl; console.log("[player] AniKage OK via", ak.server); }
            } else { console.log("[player] No AniList ID found for", title); }
          } catch (e) { console.log("[player] AniKage failed:", e.message); }
        }

        if (!videoUrl) throw new Error("No streams available from any source");
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderMegaPlayer(result.m3u8, result.tracks, info.title + " - EP" + ep, result.intro, result.outro, mid, ep));
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("EP" + ep + ": " + e.message));
      }
    }

    // MegaPlay Player: /api/player/:mal_id/:episode (2-param)
    const megaPlayer2 = path.match(/^\/api\/player\/(\d+)\/(\d+)$/);
    if (megaPlayer2) {
      const mid = parseInt(megaPlayer2[1]);
      const ep = parseInt(megaPlayer2[2]);
      const type = url.searchParams.get("type") || "sub";
      try {
        const info = await jikanInfo(mid);
        const title = info.eng || info.title;
        let result = null;
        let videoUrl = null;

        // Source 1: MegaPlay
        try {
          console.log("[player] Trying MegaPlay for", mid, "ep", ep);
          const mp = await extractMegaPlayByMal(mid, ep, type);
          if (mp && mp.m3u8) { result = mp; videoUrl = mp.m3u8; console.log("[player] MegaPlay OK"); }
        } catch (e) { console.log("[player] MegaPlay failed:", e.message); }

        // Source 2: AniZone
        if (!videoUrl) {
          try {
            console.log("[player] Trying AniZone for", title);
            const az = await anizoneExtract(title, ep);
            if (az && az.videoUrl) { result = { m3u8: az.videoUrl, tracks: az.tracks || [], intro: null, outro: null }; videoUrl = az.videoUrl; console.log("[player] AniZone OK"); }
          } catch (e) { console.log("[player] AniZone failed:", e.message); }
        }

        // Source 3: AniKage (tries all servers internally)
        if (!videoUrl) {
          try {
            const anilistId = await findAnilistIdByTitle(title, mid);
            if (anilistId) {
              console.log("[player] Trying AniKage for", anilistId, "ep", ep);
              const ak = await anikageExtract(anilistId, ep, type);
              if (ak && ak.videoUrl) { result = { m3u8: ak.videoUrl, tracks: ak.tracks || [], intro: ak.intro || null, outro: ak.outro || null }; videoUrl = ak.videoUrl; console.log("[player] AniKage OK via", ak.server); }
            } else { console.log("[player] No AniList ID found for", title); }
          } catch (e) { console.log("[player] AniKage failed:", e.message); }
        }

        if (!videoUrl) throw new Error("No streams available from any source");
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderMegaPlayer(result.m3u8, result.tracks, info.title + " - EP" + ep, result.intro, result.outro, mid, ep));
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("EP" + ep + ": " + e.message));
      }
    }

    // ====== AniZone Routes ======
    // GET /api/az/search?q=... (search AniZone by title)
    if (path === "/api/az/search") {
      const q = url.searchParams.get("q") || "";
      if (!q) return res.status(400).json({ error: "Missing search query" });
      try {
        const results = await anizoneSearch(q);
        return res.status(200).json({ query: q, results });
      } catch (e) {
        return res.status(500).json({ error: "AniZone search failed: " + e.message });
      }
    }

    // GET /api/az/anime/:slug/episode/:ep (extract m3u8 from AniZone)
    const azEpisode = path.match(/^\/api\/az\/anime\/([a-z0-9]+)\/episode\/(\d+)$/);
    if (azEpisode) {
      const slug = azEpisode[1];
      const ep = parseInt(azEpisode[2]);
      try {
        const html = await anizoneFetchEpisode(slug, ep);
        const data = anizoneParseEpisode(html, slug, ep);
        const hash = encodeHash({u: data.videoUrl});
        return res.status(200).json({
          success: true,
          source: "anizone",
          slug,
          episode: ep,
          title: data.title,
          hash,
          embedUrl: `/api/az/embed/${slug}/${ep}`,
          m3u8: data.videoUrl,
          tracks: data.tracks
        });
      } catch (e) {
        return res.status(500).json({ error: "AniZone extract failed: " + e.message });
      }
    }

    // GET /api/az/embed/:slug/:ep (player page for AniZone source)
    const azEmbed = path.match(/^\/api\/az\/embed\/([a-z0-9]+)\/(\d+)$/);
    if (azEmbed) {
      const slug = azEmbed[1];
      const ep = parseInt(azEmbed[2]);
      try {
        const html = await anizoneFetchEpisode(slug, ep);
        const data = anizoneParseEpisode(html, slug, ep);
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(
          renderEmbedOnly(data.videoUrl, data.tracks, data.title + " EP" + ep, null, null)
        );
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("AniZone: " + e.message));
      }
    }

    // GET /api/az/player/:slug/:ep (full player page for AniZone)
    const azPlayer = path.match(/^\/api\/az\/player\/([a-z0-9]+)\/(\d+)$/);
    if (azPlayer) {
      const slug = azPlayer[1];
      const ep = parseInt(azPlayer[2]);
      try {
        const html = await anizoneFetchEpisode(slug, ep);
        const data = anizoneParseEpisode(html, slug, ep);
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(
          renderMegaPlayer(data.videoUrl, data.tracks, data.title, null, null, 0, ep)
        );
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("AniZone: " + e.message));
      }
    }

    // ====== AniKage Routes ======

    // GET /api/ak/servers/:anilist_id/episode/:num ÔÇö available servers
    const akServers = path.match(/^\/api\/ak\/servers\/(\d+)\/episode\/(\d+)$/);
    if (akServers) {
      const aid = parseInt(akServers[1]);
      const ep = parseInt(akServers[2]);
      try {
        const data = await anikageGetServers(aid, ep);
        return res.status(200).json({ success: true, anilistId: aid, episode: ep, servers: data.servers || [], embeds: data.embeds || [] });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/ak/sources/:anilist_id/episode/:num?server=neko&type=sub ÔÇö sources with m3u8
    const akSources = path.match(/^\/api\/ak\/sources\/(\d+)\/episode\/(\d+)$/);
    if (akSources) {
      const aid = parseInt(akSources[1]);
      const ep = parseInt(akSources[2]);
      const server = url.searchParams.get("server") || "neko";
      const audioType = url.searchParams.get("type") || "sub";
      try {
        const sources = await anikageGetSources(aid, ep, server, audioType);
        let m3u8 = null;
        const results = [];
        for (const src of sources.sources || []) {
          const dec = anikageDecrypt(src.url);
          if (dec && dec.includes(".m3u8")) { m3u8 = m3u8 || dec; results.push({ server: src.server || "HD-1", quality: src.quality, url: dec }); }
        }
        const tracks = (sources.subtitles || []).map(t => {
          let subUrl = (t.file && t.file.startsWith("http")) ? t.file : null;
          if (!subUrl) subUrl = anikageDecrypt(t.file);
          if (!subUrl) subUrl = anikageSubFromEmbedUrl(t.embedUrl);
          if (!subUrl) console.warn("AniKage subtitle drop: no valid URL found for", t.label, t.srclang || t.lang);
          return { file: subUrl || "", label: t.label || "English", kind: "captions", default: t.default || false };
        }).filter(t => t.file);
        return res.status(200).json({
          success: true, anilistId: aid, episode: ep, server, type: audioType,
          m3u8, tracks, intro: sources.intro || null, outro: sources.outro || null,
          embedOptions: sources.embedOptions || [], embeds: results
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/ak/extract/:anilist_id/episode/:num ÔÇö full auto-extract (uses best server)
    const akExtract = path.match(/^\/api\/ak\/extract\/(\d+)\/episode\/(\d+)$/);
    if (akExtract) {
      const aid = parseInt(akExtract[1]);
      const ep = parseInt(akExtract[2]);
      const audioType = url.searchParams.get("type") || "sub";
      try {
        const data = await anikageExtract(aid, ep, audioType);
        const hash = encodeHash({u: data.videoUrl});
        return res.status(200).json({
          success: true, source: "anikage", anilistId: aid, episode: ep, type: audioType,
          server: data.server, hash, m3u8: data.videoUrl,
          tracks: data.tracks, intro: data.intro, outro: data.outro,
          servers: data.servers, embeds: data.embeds, embedOptions: data.embedOptions
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/ak/embed/:hash ÔÇö embed player page for AniKage (self-contained hash)
    const akEmbedHash = path.match(/^\/api\/ak\/embed\/([a-zA-Z0-9_-]+)$/);
    if (akEmbedHash) {
      const hash = akEmbedHash[1];
      const ent = decodeHash(hash);
      if (!ent || ent.s !== "ak") {
        return res.status(404).json({ error: "Hash not found" });
      }
      const preloaded = url.searchParams.get("m3u8");
      const preloadedTracks = url.searchParams.get("tracks");
      if (preloaded) {
        try {
          let tracks = [];
          if (preloadedTracks) {
            try { tracks = JSON.parse(Buffer.from(preloadedTracks, "base64url").toString("utf8")); } catch {}
          }
          return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(
            renderEmbedOnly(preloaded, tracks, "EP" + ent.ep, null, null)
          );
        } catch (e) {
          return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("AniKage: " + e.message));
        }
      }
      const ck = `ak:${ent.aid}:${ent.ep}:${ent.server}:${ent.type}`;
      try {
        let cached = cacheGet(ck);
        if (!cached) {
          const sources = await anikageGetSources(ent.aid, ent.ep, ent.server, ent.type);
          let m3u8 = null;
          for (const src of sources.sources || []) {
            const dec = anikageDecrypt(src.url);
            if (dec && dec.includes(".m3u8")) { m3u8 = dec; break; }
          }
          if (!m3u8) throw new Error("No accessible stream on AniKage");
          const tracks = (sources.subtitles || []).map(t => {
            let subUrl = (t.file && t.file.startsWith("http")) ? t.file : null;
            if (!subUrl) subUrl = anikageDecrypt(t.file);
            if (!subUrl) subUrl = anikageSubFromEmbedUrl(t.embedUrl);
            if (!subUrl) console.warn("AniKage subtitle drop: no valid URL found for", t.label, t.srclang || t.lang);
            return { file: subUrl || "", label: t.label || "English", kind: "captions", default: t.default || false };
          }).filter(t => t.file);
          cached = { m3u8, tracks, intro: sources.intro || null, outro: sources.outro || null };
          cacheSet(ck, cached);
        }
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(
          renderEmbedOnly(cached.m3u8, cached.tracks, "EP" + ent.ep, cached.intro, cached.outro)
        );
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("AniKage: " + e.message));
      }
    }

    // GET /api/ak/embed/:anilist_id/episode/:num ÔÇö embed player page for AniKage (legacy)
    const akEmbed = path.match(/^\/api\/ak\/embed\/(\d+)\/episode\/(\d+)$/);
    if (akEmbed) {
      const aid = parseInt(akEmbed[1]);
      const ep = parseInt(akEmbed[2]);
      const audioType = url.searchParams.get("type") || "sub";
      try {
        const data = await anikageExtract(aid, ep, audioType);
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(
          renderEmbedOnly(data.videoUrl, data.tracks, "EP" + ep, data.intro, data.outro)
        );
      } catch (e) {
        return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("AniKage: " + e.message));
      }
    }

    // Download MP4: /api/download/:mal_id/:season/:episode
    const dlMatch = path.match(/^\/api\/download\/(\d+)\/(\d+)\/(\d+)$/);
    if (dlMatch) {
      const mid = parseInt(dlMatch[1]);
      const season = parseInt(dlMatch[2]);
      const ep = parseInt(dlMatch[3]);

      let info;
      try { info = await jikanInfo(mid); } catch { return res.status(400).json({ error: "Invalid MAL ID" }); }
      const title = info.title;

      const cached = await findAnimeByTitle(title);
      let tvmSeasons = [];
      if (cached?.seasons) {
        tvmSeasons = Object.values(cached.seasons).map(s => ({ number: s.seasonNumber, episodes: s.totalEpisodes || 0 }));
      } else {
        tvmSeasons = await getTvmazeSeasons(title);
      }

      const slug = toonSlug(title);

      let m3u8Url = null;
      try {
        const pageUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
        const trembedUrl = await getTrembedUrl(pageUrl);
        if (trembedUrl) {
          const videoData = await getToonVideo(trembedUrl);
          if (videoData?.iframe_url) {
            const iframeUrl = videoData.iframe_url;
            const videoId = videoData.video_id;
            const iframePage = await fetch(iframeUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
            const cookies = iframePage.headers.getSetCookie?.() || [];
            const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
            const pr = await fetch(`https://as-cdn21.top/player/index.php?data=${videoId}&do=getVideo`, {
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
            const pdata = await pr.json();
            m3u8Url = pdata.videoSource || null;
          }
        }
      } catch {}

      if (!m3u8Url) {
        return res.status(404).json({ error: "Stream not available" });
      }

      // Serve the raw m3u8 URL as a file download
      // User can open in VLC or convert with: ffmpeg -i file.m3u8 -c copy output.mp4
      const filename = `${title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_S${season}E${ep}.m3u8`;
      const rawRes = res._raw || res;
      rawRes.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*"
      });
      rawRes.end(m3u8Url);

      return;
    }

    // Embed page: /api/embed/:mal_id/:season/:episode (pure iframe)
    const embedMatch = path.match(/^\/api\/embed\/(\d+)\/(\d+)\/(\d+)$/);
    if (embedMatch) {
      const mid = parseInt(embedMatch[1]);
      const season = parseInt(embedMatch[2]);
      const ep = parseInt(embedMatch[3]);

      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError("Invalid MAL ID")); }
      const title = info.title;

      const slug = toonSlug(title);

      const pageUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
      const trembedUrl = await getTrembedUrl(pageUrl);

      if (!trembedUrl) {
        return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(`Episode S${season}E${ep} not found on ToonStream`));
      }

      const videoData = await getToonVideo(trembedUrl);
      if (!videoData || videoData.error) {
        return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(videoData?.error || "Failed to load video"));
      }

      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderEmbed(videoData.embed_url));
    }

    // Legacy embed: /api/embed/:mal_id/:episode (auto-detect season)
    const embedLegacy = path.match(/^\/api\/embed\/(\d+)\/(\d+)$/);
    if (embedLegacy) {
      const mid = parseInt(embedLegacy[1]);
      const ep = parseInt(embedLegacy[2]);
      const detectedSeason = await detectSeasonFromMalId(mid);
      return res.redirect(`/api/embed/${mid}/${detectedSeason}/${ep}`);
    }

    // Legacy watch: /api/watch/:mal_id/:episode (auto-detect season)
    const watchLegacy = path.match(/^\/api\/watch\/(\d+)\/(\d+)$/);
    if (watchLegacy && !path.includes("/api/toonstream/")) {
      const mid = parseInt(watchLegacy[1]);
      const ep = parseInt(watchLegacy[2]);
      const detectedSeason = await detectSeasonFromMalId(mid);
      return res.redirect(`/api/watch/${mid}/${detectedSeason}/${ep}`);
    }

    // Anime Watch API: /api/anime-watch/:mal_id/:episode ÔåÆ returns sub/dub hashes
    const animeWatchMatch = path.match(/^\/api\/anime-watch\/(\d+)\/(\d+)$/);
    if (animeWatchMatch) {
      const mid = parseInt(animeWatchMatch[1]);
      const ep = parseInt(animeWatchMatch[2]);
      let info;
      try { info = await jikanInfo(mid); } catch { return res.status(400).json({ error: "Invalid MAL ID" }); }
      const title = info.title || "Unknown";
      const results = { title, episode: ep, mal_id: mid, sub: null, dub: null };
      const types = ["sub", "dub"];
      for (const type of types) {
        try {
          const result = await extractMegaPlayByMal(mid, ep, type);
          if (result && result.m3u8) {
            const hash = encodeHash({ s: "mp", aid: null, malId: mid, ep, type });
            results[type] = { hash, url: "/api/watch-embed/" + hash };
          }
        } catch {}
      }
      res.setHeader("Content-Type", "application/json");
      return res.send(JSON.stringify(results));
    }

    // Watch Embed: /api/watch-embed/:hash ÔåÆ serves the player page
    const watchEmbedMatch = path.match(/^\/api\/watch-embed\/(.+)$/);
    if (watchEmbedMatch) {
      const hash = watchEmbedMatch[1];
      const decoded = decodeHash(hash);
      // Fast path: if pre-fetched m3u8 URL provided, use directly (no upstream fetch)
      const preloaded = url.searchParams.get("m3u8");
      const preloadedTracks = url.searchParams.get("tracks");
      if (preloaded && decoded && decoded.s === "mp") {
        try {
          let tracks = [];
          if (preloadedTracks) {
            try { tracks = JSON.parse(Buffer.from(preloadedTracks, "base64url").toString("utf8")); } catch {}
          }
          const html = renderEmbedOnly(preloaded, tracks, "EP" + decoded.ep, null, null, null);
          return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
        } catch (e) {
          return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("MegaPlay: " + e.message));
        }
      }
      if (decoded && decoded.s === "mp") {
        const ck = `mp:${decoded.malId}:${decoded.ep}:${decoded.type}`;
        try {
          let r = cacheGet(ck);
          if (!r) {
            r = await extractMegaPlayByMal(decoded.malId, decoded.ep, decoded.type);
            if (r && r.m3u8) cacheSet(ck, r);
          }
          if (r && r.m3u8) {
            const html = renderEmbedOnly(r.m3u8, r.tracks || [], "EP" + decoded.ep, r.intro || null, r.outro || null, null);
            return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
          }
          return res.status(404).json({ error: "Episode not available" });
        } catch (e) {
          return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(renderError("MegaPlay: " + e.message));
        }
      }
      const data = hashStore.get(hash);
      if (!data) return res.status(404).json({ error: "Hash not found or expired" });
      const { m3u8, tracks, title, intro, outro, malId, epNum, type } = data;
      const html = renderEmbedOnly(m3u8, tracks, title + " [" + type.toUpperCase() + "] EP" + epNum, intro, outro, null);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    // ====== NEW ANILIST-BASED ENDPOINTS ======

    // Helper: find AniList ID by title and MAL ID
    async function findAnilistIdByTitle(title, malId) {
      try {
        const d = await anilistQuery(
          `query($q:String,$p:Int,$pp:Int){Page(page:$p,perPage:$pp){media(search:$q,type:ANIME){id idMal}}}`,
          { q: title, p: 1, pp: 10 }
        );
        if (d.Page && d.Page.media) {
          const exact = d.Page.media.find(m => m.idMal === malId);
          if (exact) return exact.id;
          if (d.Page.media.length) return d.Page.media[0].id;
        }
      } catch {}
      return null;
    }

    // Helper: format AniList media to common JSON
    function fmtMedia(m) {
      if (!m) return null;
      const eps = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0);
      function fmtDate(d) {
        if (!d || !d.year) return null;
        return `${d.year}-${String(d.month||1).padStart(2,"0")}-${String(d.day||1).padStart(2,"0")}`;
      }
      return {
        id: m.id,
        malId: m.idMal || null,
        title: m.title?.romaji || m.title?.english || "",
        titleEnglish: m.title?.english || "",
        titleNative: m.title?.native || "",
        image: m.coverImage?.extraLarge || m.coverImage?.large || "",
        coverImage: m.coverImage?.extraLarge || "",
        bannerImage: m.bannerImage || "",
        description: (m.description || "").replace(/<[^>]+>/g, ""),
        status: m.status || "",
        format: m.format || "",
        totalEpisodes: eps,
        duration: m.duration || null,
        season: m.season || "",
        seasonYear: m.seasonYear || null,
        score: m.averageScore || null,
        popularity: m.popularity || null,
        trending: m.trending || null,
        favourites: m.favourites || null,
        genres: m.genres || [],
        studios: (m.studios?.nodes || []).map(s => s.name),
        source: m.source || "",
        country: m.countryOfOrigin || "",
        startDate: fmtDate(m.startDate),
        endDate: fmtDate(m.endDate),
        nextAiringEpisode: m.nextAiringEpisode ? {
          episode: m.nextAiringEpisode.episode,
          airingAt: m.nextAiringEpisode.airingAt,
          timeUntilAiring: m.nextAiringEpisode.timeUntilAiring
        } : null,
        trailer: m.trailer ? `https://www.youtube.com/watch?v=${m.trailer.id}` : null
      };
    }

    // GET /api/trending
    if (path === "/api/trending") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "20"), 50);
      try {
        const d = await anilistQuery(
          `query($p:Int,$pp:Int){Page(page:$p,perPage:$pp){media(sort:TRENDING_DESC,type:ANIME){id idMal title{romaji english native}coverImage{large extraLarge}bannerImage status episodes format averageScore popularity trending genres studios{nodes{name}}nextAiringEpisode{episode}}}}`,
          { p: page, pp: perPage }
        );
        const results = d.Page.media.map(fmtMedia).filter(m => m.malId && (m.totalEpisodes > 0 || m.status === "RELEASING" || m.status === "NOT_YET_RELEASED"));
        return res.status(200).json({
          currentPage: page,
          hasNextPage: d.Page.media.length === perPage,
          results
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/top-rated
    if (path === "/api/top-rated") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "20"), 50);
      const genreFilter = url.searchParams.get("genres") || "";
      const genreArr = genreFilter ? genreFilter.split(",") : [];
      try {
        const d = await anilistQuery(
          `query($p:Int,$pp:Int,$genres:[String]){Page(page:$p,perPage:$pp){media(sort:SCORE_DESC,type:ANIME,genre_in:$genres){id idMal title{romaji english native}coverImage{large extraLarge}bannerImage status episodes format averageScore popularity genres studios{nodes{name}}nextAiringEpisode{episode}}}}`,
          { p: page, pp: perPage, genres: genreArr.length ? genreArr : undefined }
        );
        const results = d.Page.media.map(fmtMedia).filter(m => m.malId && (m.totalEpisodes > 0 || m.status === "RELEASING" || m.status === "NOT_YET_RELEASED"));
        return res.status(200).json({
          currentPage: page,
          hasNextPage: d.Page.media.length === perPage,
          results
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/search?q=...
    if (path === "/api/search") {
      const q = url.searchParams.get("q") || url.searchParams.get("query") || "";
      if (!q) return res.status(400).json({ error: "Missing search query" });
      const page = parseInt(url.searchParams.get("page") || "1");
      const perPage = Math.min(parseInt(url.searchParams.get("perPage") || "20"), 50);
      try {
        const d = await anilistQuery(
          `query($q:String,$p:Int,$pp:Int){Page(page:$p,perPage:$pp){media(search:$q,type:ANIME){id idMal title{romaji english native}coverImage{large extraLarge}bannerImage status episodes format averageScore popularity genres nextAiringEpisode{episode}}}}`,
          { q, p: page, pp: perPage }
        );
        const results = d.Page.media.map(fmtMedia).filter(m => m.malId && (m.totalEpisodes > 0 || m.status === "RELEASING" || m.status === "NOT_YET_RELEASED"));
        return res.status(200).json({
          currentPage: page,
          hasNextPage: d.Page.media.length === perPage,
          query: q,
          results
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/anime/:anilist_id  (AniList-based anime info)
    const animeMatch = path.match(/^\/api\/anime\/(\d+)$/);
    if (animeMatch) {
      const aid = parseInt(animeMatch[1]);
      try {
        const d = await anilistQuery(
          `query($id:Int){Media(id:$id,type:ANIME){id idMal title{romaji english native}coverImage{large extraLarge}bannerImage description(asHtml:false)status episodes duration season seasonYear averageScore meanScore popularity trending favourites genres studios{nodes{name}}type format source countryOfOrigin startDate{year month day}endDate{year month day}nextAiringEpisode{airingAt timeUntilAiring episode}trailer{site thumbnail}}}`,
          { id: aid }
        );
        const media = d.Media;
        if (!media) return res.status(404).json({ error: "Anime not found" });
        return res.status(200).json(fmtMedia(media));
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // GET /api/anime-embed/:anilist_id/episode/:num
    const aniEmbedMatch = path.match(/^\/api\/anime-embed\/(\d+)\/episode\/(\d+)$/);
    if (aniEmbedMatch) {
      const aid = parseInt(aniEmbedMatch[1]);
      const epNum = parseInt(aniEmbedMatch[2]);
      const type = url.searchParams.get("type") || "sub";
      const source = url.searchParams.get("source") || "";
      try {
        let d;
        try {
          d = await anilistQuery(
            `query($id:Int){Media(id:$id,type:ANIME){id idMal title{romaji english}}}`,
            { id: aid }
          );
        } catch (e) {
          return res.status(502).json({ error: "AniList API failed: " + e.message });
        }
        if (!d.Media) return res.status(404).json({ error: "Anime not found" });
        const malId = d.Media.idMal;
        const title = d.Media.title?.romaji || d.Media.title?.english || "Unknown";
        const audioType = type === "dub" ? "dub" : "sub";

        // If a specific source is requested, return single-source response (backward compat)
        if (source === "anizone") {
          if (!title) return res.status(400).json({ error: "No title for search" });
          const azResult = await anizoneExtract(title, epNum);
          const hash = encodeHash({u: azResult.videoUrl});
          return res.status(200).json({
            success: true, source: "anizone", anilistId: aid, slug: azResult.slug,
            title: azResult.title, episode: epNum, hash, m3u8: azResult.videoUrl, tracks: azResult.tracks
          });
        }
        if (source === "anikage") {
          const akResult = await anikageExtract(aid, epNum, audioType);
          const hash = encodeHash({ s: "ak", aid, ep: epNum, server: akResult.server, type: audioType });
          return res.status(200).json({
            success: true, source: "anikage", anilistId: aid, episode: epNum, type: audioType,
            server: akResult.server, hash, m3u8: akResult.videoUrl, tracks: akResult.tracks,
            intro: akResult.intro, outro: akResult.outro, servers: akResult.servers, embedOptions: akResult.embedOptions
          });
        }
        if (source === "megaplay") {
          if (!malId) return res.status(400).json({ error: "No MAL ID mapping found" });
          const result = await extractMegaPlayByMal(malId, epNum, audioType);
          if (!result || !result.m3u8) return res.status(404).json({ error: "Episode not available" });
          const hash = encodeHash({ s: "mp", aid, malId, ep: epNum, type: audioType });
          return res.status(200).json({
            success: true, source: "megaplay", anilistId: aid, malId, title, episode: epNum, type: audioType,
            hash, embedUrl: `/api/watch-embed/${hash}`, m3u8: result.m3u8, intro: result.intro || null, outro: result.outro || null,
            tracks: (result.tracks || []).filter(t => t.kind === "captions" || t.kind === "subtitles").map(t => ({ file: t.file, label: t.label || "English", default: t.default || false }))
          });
        }

        // No source param: return embed URLs for ALL sources
        const result = { success: true, anilistId: aid, malId, title, episode: epNum, sources: [] };

        // Run all 3 sources in parallel
        const [mpResults, azResult, akResult] = await Promise.allSettled([
          // 1) MegaPlay sub + dub
          (async () => {
            if (!malId) return [];
            const out = [];
            const entries = await Promise.allSettled(["sub", "dub"].map(async t => {
              const ck = `mp:${malId}:${epNum}:${t}`;
              let r = cacheGet(ck);
              if (!r) {
                r = await extractMegaPlayByMal(malId, epNum, t);
                if (r && r.m3u8) cacheSet(ck, r);
              }
              if (r && r.m3u8) {
                const h = encodeHash({ s: "mp", aid, malId, ep: epNum, type: t });
                return { source: "megaplay", label: t.toUpperCase(), embedUrl: `/api/watch-embed/${h}`, m3u8: r.m3u8, tracks: (r.tracks || []).filter(tr => tr.kind === "captions" || tr.kind === "subtitles").map(tr => ({ file: tr.file, label: tr.label || "English", srclang: tr.srclang || tr.lang || detectLangCode(tr.label || ""), default: tr.default || false })), intro: r.intro || null, outro: r.outro || null };
              }
              return null;
            }));
            for (const e of entries) { if (e.status === "fulfilled" && e.value) out.push(e.value); }
            return out;
          })(),
          // 2) AniZone
          (async () => {
            if (!title) return null;
            const az = await anizoneExtract(title, epNum);
            return { source: "anizone", label: "AniZone", slug: az.slug, embedUrl: `/api/az/embed/${az.slug}/${epNum}` };
          })(),
          // 3) AniKage
          (async () => {
            const serversData = await anikageGetServers(aid, epNum);
            const out = [];
            let firstDone = false;
            for (const sv of serversData.servers || []) {
              for (const st of (sv.subTypes || ["sub"])) {
                const h = encodeHash({ s: "ak", aid, ep: epNum, server: sv.id, type: st });
                const entry = { source: "anikage", label: (sv.label || sv.id) + " " + st.toUpperCase(), server: sv.id, type: st, embedUrl: `/api/ak/embed/${h}` };
                if (!firstDone) {
                  try {
                    const ck = `ak:${aid}:${epNum}:${sv.id}:${st}`;
                    let cached = cacheGet(ck);
                    if (!cached) {
                      const src = await anikageGetSources(aid, epNum, sv.id, st);
                      let m3u8 = null;
                      for (const s of src.sources || []) {
                        const dec = anikageDecrypt(s.url);
                        if (dec && dec.includes(".m3u8")) { m3u8 = dec; break; }
                      }
                      if (m3u8) {
                        const tracks = (src.subtitles || []).map(t => {
                          let subUrl = (t.file && t.file.startsWith("http")) ? t.file : null;
                          if (!subUrl) subUrl = anikageDecrypt(t.file);
                          if (!subUrl) subUrl = anikageSubFromEmbedUrl(t.embedUrl);
                          if (!subUrl) console.warn("AniKage subtitle drop: no valid URL found for", t.label, t.srclang || t.lang);
                          return { file: subUrl || "", label: t.label || "English", kind: "captions", default: t.default || false };
                        }).filter(t => t.file);
                        cached = { m3u8, tracks, intro: src.intro || null, outro: src.outro || null };
                        cacheSet(ck, cached);
                      }
                    }
                    if (cached && cached.m3u8) {
                      entry.m3u8 = cached.m3u8;
                      entry.tracks = cached.tracks || [];
                      firstDone = true;
                    }
                  } catch {}
                }
                out.push(entry);
              }
            }
            return out;
          })()
        ]);

        if (mpResults.status === "fulfilled") result.sources.push(...mpResults.value);
        if (azResult.status === "fulfilled" && azResult.value) result.sources.push(azResult.value);
        if (akResult.status === "fulfilled") result.sources.push(...akResult.value);

        return res.status(200).json(result);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
