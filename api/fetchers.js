const config = require("./config");

const { BASE, AJAX, JIKAN, ANILIST, UA, PROXY_BASE, keepAliveAgent } = config;

const anilistCache = new Map();
const ANILIST_CACHE_TTL = 3600000;
let anilistLastCall = 0;

async function anilistQuery(query, variables) {
  const ck = JSON.stringify({ q: query, v: variables });
  const cached = anilistCache.get(ck);
  if (cached && Date.now() - cached.ts < ANILIST_CACHE_TTL) return cached.data;
  const wait = 700 - (Date.now() - anilistLastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  anilistLastCall = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(ANILIST, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ query, variables })
    });
    if (r.status === 429) {
      const retryAfter = parseInt(r.headers.get("retry-after") || "5");
      await new Promise(res => setTimeout(res, retryAfter * 1000));
      continue;
    }
    const d = await r.json();
    if (d.errors) throw new Error(d.errors[0].message);
    anilistCache.set(ck, { ts: Date.now(), data: d.data });
    return d.data;
  }
  throw new Error("AniList rate limited");
}

function slugify(t) {
  return t.toLowerCase().replace(/[:'"()]/g, "").replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function jikanInfo(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${JIKAN}/anime/${id}`, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const d = await r.json();
      const a = d.data || {};
      return { title: a.title || "", eng: a.title_english || a.title || "", episodes: a.episodes || 0, image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "" };
    }
    if (r.status === 429 || r.status >= 500) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`MAL_API_ERROR`);
  }
  throw new Error(`MAL_API_ERROR`);
}

async function getEpCountFrom9Anime(title) {
  try {
    const r = await fetch(`${BASE}${slugify(title)}-episode-1/`, { headers: { "User-Agent": UA } });
    if (!r.ok) return 0;
    const h = await r.text();
    const m = h.match(/EP_DATA\s*=\s*(\[[\s\S]*?\]);/);
    if (m) {
      const data = JSON.parse(m[1]);
      return data.length;
    }
    return 0;
  } catch { return 0; }
}

async function detectSeasonFromMalId(mid, startTitle) {
  let season = 1;
  try {
    let currentId = mid;
    let currentTitle = startTitle || "";
    if (!currentTitle) {
      try {
        const initR = await fetch(`https://api.jikan.moe/v4/anime/${mid}`, { headers: { "User-Agent": UA } });
        const initD = await initR.json();
        currentTitle = (initD.data?.title || "").toLowerCase().replace(/part\s*\d+|cour\s*\d+|split\s*\d+|final\s*part/g, "").replace(/[^a-z0-9\s]/g, "").trim();
      } catch {}
    } else {
      currentTitle = currentTitle.toLowerCase().replace(/part\s*\d+|cour\s*\d+|split\s*\d+|final\s*part/g, "").replace(/[^a-z0-9\s]/g, "").trim();
    }
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r = await fetch(`https://api.jikan.moe/v4/anime/${currentId}/relations`, { headers: { "User-Agent": UA } });
      const d = await r.json();
      const prequel = (d.data || []).find(r => r.relation === "Prequel" && r.entry?.[0]);
      if (!prequel) break;
      currentId = prequel.entry[0].mal_id;
      await new Promise(r => setTimeout(r, 1000));
      const infoR = await fetch(`https://api.jikan.moe/v4/anime/${currentId}`, { headers: { "User-Agent": UA } });
      const infoD = await infoR.json();
      const type = (infoD.data?.type || "").toUpperCase();
      if (type === "TV" || type === "MOVIE" || type === "ONA") {
        const prequelTitle = (infoD.data?.title || "").toLowerCase().replace(/part\s*\d+|cour\s*\d+|split\s*\d+|final\s*part/g, "").replace(/[^a-z0-9\s]/g, "").trim();
        if (prequelTitle !== currentTitle) {
          season++;
        }
        currentTitle = prequelTitle;
      }
    }
  } catch (e) { console.log("detectSeason error:", e.message); }
  return season;
}

async function findMalId(title) {
  const r = await fetch(`${BASE}${slugify(title)}-episode-1/`, { headers: { "User-Agent": UA } });
  if (!r.ok) return { malId: null, epCount: 0 };
  const h = await r.text();
  const m = h.match(/var malId\s*=\s*["'](\d+)/);
  let epCount = 0;
  const e = h.match(/EP_DATA\s*=\s*(\[[\s\S]*?\]);/);
  if (e) { try { epCount = JSON.parse(e[1]).length; } catch {} }
  return { malId: m ? m[1] : null, epCount };
}

async function ajaxDL(mid, ep) {
  const r = await fetch(AJAX, {
    method: "POST",
    headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Origin: BASE, Referer: BASE, "Content-Type": "application/x-www-form-urlencoded" },
    body: `action=fetch_download_links&mal_id=${mid}&ep=${ep}`,
  });
  return r.json();
}

function parseDL(html) {
  const res = { sub: [], dub: [] };
  const sectionRe = /<div class="dl-section-header"><span class="dl-section-title">(.*?)<\/span>/g;
  let secMatch;
  while ((secMatch = sectionRe.exec(html)) !== null) {
    const secName = secMatch[1].trim().toUpperCase();
    const escaped = secMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rowRe = new RegExp(escaped + '[\\s\\S]*?<div class="dl-bubble-row">([\\s\\S]*?)</div></div>');
    const rowMatch = html.match(rowRe);
    if (!rowMatch) continue;
    const linkRe = /<a href="([^"]+)"[^>]*class="dl-bubble-item"[\s\S]*?<span class="dl-bubble-text">(.*?)<\/span>/g;
    let lm;
    while ((lm = linkRe.exec(rowMatch[1])) !== null) {
      const entry = { url: lm[1], label: (lm[2] || "Default").replace(/<[^>]+>/g, "").trim() };
      if (secName === "SUBTITLED") res.sub.push(entry);
      else if (secName === "DUBBED") res.dub.push(entry);
    }
  }
  return res;
}

async function getImg(name, ep) {
  try {
    const r = await fetch(`${BASE}${slugify(name)}-episode-${ep}/`, { headers: { "User-Agent": UA } });
    if (!r.ok) return "";
    const h = await r.text();
    const m = h.match(/background-image:\s*url\('([^']+)'\)/);
    return m ? m[1] : "";
  } catch { return ""; }
}

function nodeFetch(url, headers, redirectCount) {
  if (redirectCount === undefined) redirectCount = 5;
  // Route through proxy if PROXY_BASE is set and target is a blocked host
  const u = new URL(url);
  if (PROXY_BASE && (u.hostname.endsWith("anikage.cc") || u.hostname.endsWith("anizone.to"))) {
    return proxyFetch(url, headers, redirectCount);
  }
  return directFetch(url, headers, redirectCount);
}

function directFetch(url, headers, redirectCount) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? require("https") : require("http");
    const opts = {
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method: "GET",
      headers: { ...headers }, rejectUnauthorized: false,
      agent: u.protocol === "https:" ? keepAliveAgent : undefined,
    };
    const req = mod.request(opts, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && redirectCount > 0) {
        const location = res.headers.location;
        if (location) {
          const absUrl = location.startsWith("http") ? location : new URL(location, url).href;
          resolve(directFetch(absUrl, headers, redirectCount - 1));
          return;
        }
      }
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: () => data, json: () => JSON.parse(data) });
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function proxyFetch(url, headers, redirectCount) {
  const isJson = (headers["Accept"] || "").includes("json");
  const r = await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(url)}&json=${isJson}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("Proxy fetch failed: " + r.status);
  const text = await r.text();
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: () => text, json: () => { try { return JSON.parse(text); } catch { return {}; } } };
}

module.exports = {
  anilistQuery,
  slugify,
  jikanInfo,
  getEpCountFrom9Anime,
  detectSeasonFromMalId,
  findMalId,
  ajaxDL,
  parseDL,
  getImg,
  nodeFetch,
  directFetch,
  proxyFetch,
};
