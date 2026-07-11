const BASE = "https://9anime.org.lv/";
const AJAX = "https://9anime.org.lv/wp-admin/admin-ajax.php";
const JIKAN = "https://api.jikan.moe/v4";
const ANILIST = "https://graphql.anilist.co";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const { spawn } = require("child_process");
const { Readable } = require("stream");
const https = require("https");
const PROXY_BASE = process.env.PROXY_BASE || "";
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 20 });

const anilistCache = new Map();
const ANILIST_CACHE_TTL = 3600000;
let anilistLastCall = 0;

let TVDB_TOKEN=null,TVDB_TOKEN_TIME=0;

const SHARED_BG = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;min-height:100vh;background:#0a0808;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.bg-layer{position:fixed;inset:0;z-index:0}
.bg-layer img{width:100%;height:100%;object-fit:cover;filter:blur(60px) brightness(0.18) saturate(1.8) hue-rotate(-10deg);transform:scale(1.5)}
.bg-layer::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,8,8,0.05) 0%,rgba(10,8,8,0.45) 25%,rgba(10,8,8,0.82) 60%,#0a0808 100%)}
.bg-overlay{position:fixed;inset:0;z-index:1;background:radial-gradient(ellipse at 50% 20%,rgba(255,60,47,0.06) 0%,transparent 50%),radial-gradient(ellipse at 30% 80%,rgba(255,170,0,0.04) 0%,transparent 40%)}
.page{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column}
.header{padding:18px 24px;display:flex;align-items:center;justify-content:space-between}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-icon{width:42px;height:42px;background:linear-gradient(135deg,#ff3c2f,#ff6b35,#ffaa00);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 24px rgba(255,60,47,0.4);animation:iconPulse 3s ease-in-out infinite}
@keyframes iconPulse{0%,100%{box-shadow:0 4px 24px rgba(255,60,47,0.4)}50%{box-shadow:0 6px 32px rgba(255,170,0,0.5)}}
.logo-text{font-size:24px;font-weight:900;background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 40%,#ffaa00 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 8px rgba(255,100,0,0.3))}
.footer{padding:30px 24px;text-align:center;animation:su .5s ease-out .35s both}
.footer p{font-size:12px;color:rgba(255,255,255,0.1)}
.footer a{color:#ff6b35;text-decoration:none;font-weight:600}
@keyframes su{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}`;

let ANIME_CACHE = null;
let CACHE_TIME = 0;

const ANIKOTO_API = "https://anikotoapi.site";
const MEGAPLAY_BASE = "https://megaplay.buzz";

const hashStore = new Map();
const m3u8Store = new Map();
const akLookup = new Map();

// TTL cache: key -> { data, ts } — 30 min expiry
const streamCache = new Map();
const CACHE_TTL = 1800000;
function cacheGet(key) {
  const e = streamCache.get(key);
  if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  if (e) streamCache.delete(key);
  return null;
}
function cacheSet(key, data) {
  if (streamCache.size > 200) {
    const oldest = streamCache.keys().next().value;
    streamCache.delete(oldest);
  }
  streamCache.set(key, { data, ts: Date.now() });
}

// m3u8Store with TTL (1 hour)
const M3U8_STORE_TTL = 3600000;
function m3u8Get(key) {
  const e = m3u8Store.get(key);
  if (e && Date.now() - e.ts < M3U8_STORE_TTL) return e.data;
  if (e) m3u8Store.delete(key);
  return null;
}
function m3u8Set(key, data) {
  if (m3u8Store.size > 500) {
    const oldest = m3u8Store.keys().next().value;
    m3u8Store.delete(oldest);
  }
  m3u8Store.set(key, { data, ts: Date.now() });
}

const MEGAPLAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://megaplay.buzz/",
  "Origin": "https://megaplay.buzz",
  "Accept": "*/*",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty"
};
const ANIZONE_BASE = "https://anizone.to";
const ANIZONE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://anizone.to/",
  "Origin": "https://anizone.to",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Cache-Control": "max-age=0"
};
const ANIKAGE_BASE = "https://anikage.cc";
const ANIKAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://anikage.cc/",
  "Origin": "https://anikage.cc",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin"
};

const AK_XOR_KEY = "aproxy2026";

module.exports = {
  BASE,
  AJAX,
  JIKAN,
  ANILIST,
  UA,
  spawn,
  Readable,
  https,
  PROXY_BASE,
  keepAliveAgent,
  anilistCache,
  ANILIST_CACHE_TTL,
  anilistLastCall,
  TVDB_TOKEN,
  TVDB_TOKEN_TIME,
  SHARED_BG,
  ANIME_CACHE,
  CACHE_TIME,
  ANIKOTO_API,
  MEGAPLAY_BASE,
  hashStore,
  m3u8Store,
  akLookup,
  streamCache,
  CACHE_TTL,
  cacheGet,
  cacheSet,
  M3U8_STORE_TTL,
  m3u8Get,
  m3u8Set,
  MEGAPLAY_HEADERS,
  ANIZONE_BASE,
  ANIZONE_HEADERS,
  ANIKAGE_BASE,
  ANIKAGE_HEADERS,
  AK_XOR_KEY
};
