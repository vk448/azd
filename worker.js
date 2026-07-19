// Polyfills & Fallbacks for WinterJS / Edge runtimes
if (typeof Object.assign !== 'function') {
  Object.assign = function(target) {
    if (target == null) { throw new TypeError('Cannot convert undefined or null to object'); }
    var to = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];
      if (nextSource != null) {
        for (var nextKey in nextSource) {
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };
}

if (typeof Object.entries !== "function") {
  Object.entries = function(obj) {
    var ownProps = Object.keys(obj), i = ownProps.length, resArray = new Array(i);
    while (i--) resArray[i] = [ownProps[i], obj[ownProps[i]]];
    return resArray;
  };
}

if (typeof Object.values !== "function") {
  Object.values = function(obj) {
    var ownProps = Object.keys(obj), i = ownProps.length, resArray = new Array(i);
    while (i--) resArray[i] = obj[ownProps[i]];
    return resArray;
  };
}

if (typeof Promise.allSettled !== "function") {
  Promise.allSettled = function(promises) {
    return Promise.all(
      promises.map(function(p) {
        return Promise.resolve(p).then(
          function(v) { return { status: "fulfilled", value: v }; },
          function(e) { return { status: "rejected", reason: e }; }
        );
      })
    );
  };
}

if (typeof Array.prototype.find !== "function") {
  Array.prototype.find = function(predicate) {
    if (this == null) { throw new TypeError('Array.prototype.find called on null or undefined'); }
    if (typeof predicate !== 'function') { throw new TypeError('predicate must be a function'); }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;
    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) { return value; }
    }
    return undefined;
  };
}

if (typeof Array.prototype.some !== "function") {
  Array.prototype.some = function(fun/*, thisArg*/) {
    if (this == null) { throw new TypeError('Array.prototype.some called on null or undefined'); }
    if (typeof fun !== 'function') { throw new TypeError(); }
    var t = Object(this);
    var len = t.length >>> 0;
    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    for (var i = 0; i < len; i++) {
      if (i in t && fun.call(thisArg, t[i], i, t)) { return true; }
    }
    return false;
  };
}

if (typeof String.prototype.includes !== "function") {
  String.prototype.includes = function(search, start) {
    if (typeof start !== 'number') { start = 0; }
    if (start + search.length > this.length) { return false; }
    return this.indexOf(search, start) !== -1;
  };
}

if (typeof Array.prototype.includes !== "function") {
  Array.prototype.includes = function(searchElement, fromIndex) {
    return this.indexOf(searchElement, fromIndex) !== -1;
  };
}

if (typeof String.prototype.startsWith !== 'function') {
  String.prototype.startsWith = function(searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
  };
}

if (typeof String.prototype.endsWith !== 'function') {
  String.prototype.endsWith = function(searchString, position) {
    if (position === undefined || position > this.length) { position = this.length; }
    return this.substring(position - searchString.length, position) === searchString;
  };
}

var CONFIG_STORE = {};
function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}
function storeConfig(cfg) {
  var key = simpleHash(cfg.m3u8 || "") + "_" + (cfg.source || "") + "_" + (cfg.type || "");
  CONFIG_STORE[key] = cfg;
  return key;
}
function getConfig(id) {
  return CONFIG_STORE[id] || null;
}

var SCRAPE_CACHE = {};
var SCRAPE_CACHE_TTL = 5 * 60 * 1000;
function cacheScrape(key, data) { SCRAPE_CACHE[key] = { ts: Date.now(), data: data }; }
function getScrapeCache(key) { var e = SCRAPE_CACHE[key]; if (e && Date.now() - e.ts < SCRAPE_CACHE_TTL) return e.data; return null; }

function toBase64(str) {
  if (typeof btoa === "function") {
    try { return btoa(str); } catch (e) {}
  }
  if (typeof Buffer === "function") {
    try { return Buffer.from(str, "utf8").toString("base64"); } catch (e) {}
  }
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var encoded = "";
  for (var i = 0; i < str.length; i += 3) {
    var c1 = str.charCodeAt(i), c2 = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN, c3 = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN;
    var byte1 = c1 >> 2;
    var byte2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : (c2 >> 4));
    var byte3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : (c3 >> 6)));
    var byte4 = isNaN(c3) ? 64 : (c3 & 63);
    encoded += chars.charAt(byte1) + chars.charAt(byte2) + (byte3 === 64 ? "=" : chars.charAt(byte3)) + (byte4 === 64 ? "=" : chars.charAt(byte4));
  }
  return encoded;
}

function fromBase64(str) {
  if (typeof atob === "function") {
    try { return atob(str); } catch (e) {}
  }
  if (typeof Buffer === "function") {
    try { return Buffer.from(str, "base64").toString("utf8"); } catch (e) {}
  }
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var decoded = "";
  str = str.replace(/=+$/, "");
  for (var i = 0; i < str.length; i += 4) {
    var b1 = chars.indexOf(str.charAt(i)), b2 = i + 1 < str.length ? chars.indexOf(str.charAt(i + 1)) : 0, b3 = i + 2 < str.length ? chars.indexOf(str.charAt(i + 2)) : 64, b4 = i + 3 < str.length ? chars.indexOf(str.charAt(i + 3)) : 64;
    var c1 = (b1 << 2) | (b2 >> 4);
    var c2 = ((b2 & 15) << 4) | (b3 >> 2);
    var c3 = ((b3 & 3) << 6) | b4;
    decoded += String.fromCharCode(c1);
    if (b3 !== 64) decoded += String.fromCharCode(c2);
    if (b4 !== 64) decoded += String.fromCharCode(c3);
  }
  return decoded;
}


const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MEGAPLAY_BASE = "https://megaplay.buzz";
const VIDTUBE_BASE = "https://vidtube.site";
const WORKER_DOMAINS = [
  "official9animedownloader.workerforcloud.workers.dev",
  "official9animedownloader.workerforcloud3.workers.dev",
  "official9animedownloader2.workerforcloud2.workers.dev",
];

function buildWorkerUrl(code) {
  return WORKER_DOMAINS.map(function(d) { return "https://" + d + "/" + code; });
}

function extractCodeFromUrl(url) {
  var m = url.match(/\/([A-Za-z0-9+/=]+)$/);
  return m ? m[1] : null;
}

const CDN_HEADERS = {
  "User-Agent": UA,
  "Referer": "https://megaplay.buzz/",
  "Origin": "https://megaplay.buzz",
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Connection": "keep-alive",
  "DNT": "1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache",
};

const ANIKAGE_API_BASE = "https://anikage.cc/api/media/anime";
const ANIKAGE_HEADERS = {
  "User-Agent": UA,
  "Referer": "https://anikage.cc/",
  "Accept": "application/json, text/plain, */*",
};

const ANIKOTO_API_BASE = "https://anikotoapi.site";
const ANIKOTO_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json",
};

async function scrapeEmbeds(anilistId, episode, lang, serverName) {
  var cacheKey = "se-" + anilistId + "-" + episode + "-" + lang + "-" + (serverName || "default");
  var cached = getScrapeCache(cacheKey);
  if (cached) return cached;

  try {
    var validServers = ["neko", "koto", "miko", "dib", "wave", "senshi"];
    var provider = serverName && validServers.indexOf(serverName) > -1 ? serverName : "neko";
    var apiUrl = ANIKAGE_API_BASE + "/" + anilistId + "/episodes/" + episode + "/sources?provider=" + provider + "&lang=" + (lang || "sub");
    var r = await fetch(apiUrl, { headers: ANIKAGE_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    var data = await r.json();
    if (!data || !data.embeds || data.embeds.length === 0) return null;

    var embeds = data.embeds || [];
    var subtitles = data.subtitles || [];
    var sources = data.sources || [];
    var m3u8Url = null;
    var usedEmbed = null;

    for (var ei = 0; ei < embeds.length; ei++) {
      var eUrl = embeds[ei].url;
      if (!eUrl) continue;
      if (eUrl.match(/\.m3u8(\?|$)/)) {
        m3u8Url = eUrl;
        usedEmbed = eUrl;
        break;
      }
      var scraped = await scrapeM3u8FromEmbed(eUrl);
      if (scraped) {
        m3u8Url = scraped;
        usedEmbed = eUrl;
        break;
      }
    }

    if (!m3u8Url) return null;

    var tracks = [];
    for (var si = 0; si < sources.length; si++) {
      var src = sources[si];
      if (src.embedUrl) {
        try {
          var subMatch = src.embedUrl.match(/[?&]sub=([^&]+)/);
          if (subMatch) {
            var subUrl = decodeURIComponent(subMatch[1]);
            if (subUrl && subUrl.startsWith("http") && !tracks.some(function(t) { return t.file === subUrl; })) {
              tracks.push({ file: subUrl, label: subtitles[0] && subtitles[0].label || "English", kind: "captions", default: true });
            }
          }
        } catch (e) {}
      }
    }
    if (tracks.length === 0) {
      for (var ti = 0; ti < subtitles.length; ti++) {
        var sub = subtitles[ti];
        if (sub.file && sub.file.startsWith("http")) {
          tracks.push({ file: sub.file, label: sub.label || "Unknown", kind: sub.kind || "captions", default: sub.default || false });
        }
      }
    }

    var result = {
      m3u8: m3u8Url,
      embedUrl: usedEmbed || "",
      tracks: tracks,
      intro: data.intro || { start: 0, end: 0 },
      outro: data.outro || { start: 0, end: 0 },
      allSources: [],
      allEmbeds: embeds.map(function(e) {
        return { url: e.url, type: e.type, server: e.server };
      })
    };

    cacheScrape(cacheKey, result);
    return result;
  } catch (e) {
    return null;
  }
}

const scrapeVaromine = scrapeEmbeds;

async function scrapeM3u8FromEmbed(embedUrl) {
  try {
    var origin = new URL(embedUrl).origin;
    var r = await fetch(embedUrl, {
      headers: { "User-Agent": UA, "Referer": origin + "/" },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    var html = await r.text();

    var m3u8Regex = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g;
    var matches = html.match(m3u8Regex);
    if (matches && matches.length > 0) {
      var filtered = matches.filter(function(u) { return u.indexOf("prox.anikage.cc") === -1 && u.indexOf("prox.anicore.tv") === -1; });
      if (filtered.length > 0) return filtered[0];
    }

    var srcRegex = /src\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/g;
    var srcMatch;
    while ((srcMatch = srcRegex.exec(html)) !== null) {
      var srcUrl = srcMatch[1];
      if (srcUrl.indexOf("prox.anikage.cc") === -1 && srcUrl.indexOf("prox.anicore.tv") === -1) return srcUrl;
    }

    var dataIdMatch = html.match(/data-id="([^"]+)"/);
    if (dataIdMatch) {
      var srcUrl2 = origin + "/stream/getSources?id=" + dataIdMatch[1];
      var r2 = await fetch(srcUrl2, {
        headers: { "User-Agent": UA, "Referer": embedUrl, "X-Requested-With": "XMLHttpRequest" },
        signal: AbortSignal.timeout(8000)
      });
      if (r2.ok) {
        var srcData = await r2.json();
        if (srcData && srcData.sources) {
          var srcFile = srcData.sources.file || srcData.sources[0] && srcData.sources[0].file;
          if (srcFile && srcFile.indexOf("prox.anikage.cc") === -1 && srcFile.indexOf("prox.anicore.tv") === -1) return srcFile;
        }
      }
    }

    var configMatch = html.match(/file\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/);
    if (configMatch && configMatch[1].indexOf("prox.anikage.cc") === -1) return configMatch[1];

    var playerMatch = html.match(/player\s*\(\s*\{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)/);
    if (playerMatch && playerMatch[1].indexOf("prox.anikage.cc") === -1) return playerMatch[1];

    return null;
  } catch (e) {
    return null;
  }
}

const DOWNLOAD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#0a0a0a;color:#fff;font-family:'Inter',system-ui,sans-serif;overflow-x:hidden}
body::before{content:'';position:fixed;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at 50% 0%,rgba(229,9,20,.12) 0%,transparent 60%);pointer-events:none;z-index:0}
.container{max-width:600px;margin:0 auto;padding:30px 16px;position:relative;z-index:1}
.back{display:inline-flex;align-items:center;gap:6px;color:#aaa;text-decoration:none;font-size:14px;margin-bottom:24px;transition:color .2s}
.back:hover{color:#e50914}
.back svg{width:18px;height:18px;fill:currentColor}
.hero{text-align:center;margin-bottom:32px}
.anime-img{width:180px;height:250px;border-radius:12px;object-fit:cover;box-shadow:0 0 30px rgba(229,9,20,.3),0 0 60px rgba(229,9,20,.1);border:2px solid rgba(229,9,20,.25);margin-bottom:16px}
.anime-title{font-size:22px;font-weight:800;letter-spacing:-.3px;margin-bottom:6px;text-shadow:0 0 20px rgba(229,9,20,.3)}
.ep-badge{display:inline-block;background:linear-gradient(135deg,#e50914,#b20710);padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.section{margin-bottom:24px}
.section-header{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.section-tag{display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.tag-sub{background:rgba(229,9,20,.15);color:#e50914;border:1px solid rgba(229,9,20,.3)}
.tag-dub{background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3)}
.link-list{display:flex;flex-direction:column;gap:10px}
.dl-link{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px;text-decoration:none;color:#fff;transition:all .25s;position:relative;overflow:hidden}
.dl-link::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,rgba(229,9,20,.08),transparent);opacity:0;transition:opacity .25s}
.dl-link:hover{border-color:rgba(229,9,20,.4);transform:translateY(-1px);box-shadow:0 4px 20px rgba(229,9,20,.15)}
.dl-link:hover::before{opacity:1}
.dl-icon{width:40px;height:40px;border-radius:8px;background:rgba(229,9,20,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1}
.dl-icon svg{width:20px;height:20px;fill:#e50914}
.dl-info{flex:1;position:relative;z-index:1}
.dl-label{font-size:14px;font-weight:600;margin-bottom:2px}
.dl-meta{font-size:12px;color:#888}
.dl-arrow{color:#555;font-size:18px;position:relative;z-index:1;transition:color .2s}
.dl-link:hover .dl-arrow{color:#e50914}
.no-links{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:20px;text-align:center;color:#666;font-size:14px}
.glow-line{width:60px;height:3px;background:linear-gradient(90deg,transparent,#e50914,transparent);margin:0 auto 24px;border-radius:2px}
.footer{text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);color:#444;font-size:12px}
</style>
</head>
<body>
<div class="container">
  <a class="back" href="javascript:history.back()">
    <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
    Back
  </a>
  <div class="hero">
    <img class="anime-img" id="animeImg" src="" alt="">
    <h1 class="anime-title" id="animeTitle">Loading...</h1>
    <div class="glow-line"></div>
    <span class="ep-badge" id="epBadge">Episode -</span>
  </div>
  <div id="content">
    <div class="no-links">Loading download links...</div>
  </div>
  <div class="footer">AnimeZilla Downloads</div>
</div>
<script>
var DATA={title:"",image:"",episode:0,sub:[],dub:[]};
try{DATA=window.__DL_DATA__||DATA}catch(e){}
document.getElementById('animeTitle').textContent=DATA.title||'Unknown';
document.getElementById('epBadge').textContent='Episode '+DATA.episode;
if(DATA.image)document.getElementById('animeImg').src=DATA.image;
function renderList(links,containerId,tag){
  var c=document.getElementById(containerId);
  if(!links||links.length===0){c.innerHTML='<div class="no-links">No '+tag+' links available</div>';return}
  var html='<div class="section-header"><span class="section-tag tag-'+tag+'">'+tag.toUpperCase()+'</span></div><div class="link-list">';
  links.forEach(function(l){html+='<a class="dl-link" href="'+l.url+'" target="_blank" rel="noopener"><div class="dl-icon"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></div><div class="dl-info"><div class="dl-label">'+(l.quality||'Default')+' '+(l.source?'('+l.source+')':'')+'</div><div class="dl-meta">'+(l.best?'⭐ Best':'')+'</div></div><div class="dl-arrow">&rsaquo;</div></a>'});
  html+='</div>';
  c.innerHTML=html;
}
renderList(DATA.sub,'subContainer','sub');
renderList(DATA.dub,'dubContainer','dub');
</script>
</body>
</html>`;

const DOWNLOAD_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>animezilla — {{TITLE}} episode {{EPISODE}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://pl30409402.effectivecpmnetwork.com/ff/24/51/ff2451a425f7fe2bb139ca10edc1e103.js"></script>
<style>
:root{--bg:#0a0a0f;--bg-2:#111116;--card:#151519;--line:rgba(255,255,255,0.08);--line-strong:rgba(255,255,255,0.14);--text:#f2f1ea;--text-dim:#8d8b96;--sun:#ffc93c;--ember:#ff4d2e;--ember-deep:#c81e3a}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:radial-gradient(ellipse 900px 500px at 50% -10%,rgba(255,77,46,0.20),transparent 60%),radial-gradient(ellipse 700px 500px at 85% 10%,rgba(255,201,60,0.10),transparent 55%),var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;overflow-x:hidden}
.noise{position:fixed;inset:0;pointer-events:none;opacity:0.035;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");z-index:0}
nav{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:28px 24px 0;position:relative;z-index:2}
.brand{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px;color:var(--text)}
.brand span{color:var(--ember)}
main{max-width:1100px;margin:0 auto;padding:60px 24px 100px;position:relative;z-index:2}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--sun);border:1px solid rgba(255,201,60,0.35);background:rgba(255,201,60,0.06);padding:6px 14px;border-radius:100px;margin-bottom:20px}
.eyebrow::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--ember);box-shadow:0 0 8px 2px var(--ember)}
.layout{display:grid;grid-template-columns:340px 1fr;gap:56px;align-items:start}
.poster-wrap{position:relative;border-radius:20px;padding:3px;background:linear-gradient(155deg,var(--sun),var(--ember) 55%,var(--ember-deep));box-shadow:0 0 50px -10px rgba(255,77,46,0.55),0 0 90px -30px rgba(255,201,60,0.35)}
.poster{border-radius:18px;overflow:hidden;aspect-ratio:3/4;background:#000;position:relative}
.poster img{width:100%;height:100%;object-fit:cover;display:block}
.poster .badge{position:absolute;top:14px;left:14px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1.5px;background:rgba(10,10,15,0.75);backdrop-filter:blur(6px);border:1px solid var(--line-strong);padding:6px 12px;border-radius:8px;color:var(--sun)}
.title-block{padding-top:6px}
h1{font-family:'Bebas Neue',sans-serif;font-size:58px;line-height:0.95;letter-spacing:1px;margin:0 0 8px;background:linear-gradient(180deg,#fff,#d9d7cf 60%,var(--sun));-webkit-background-clip:text;background-clip:text;color:transparent}
.subtitle{color:var(--text-dim);font-size:15px;margin:0 0 24px;max-width:480px;line-height:1.6}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}
.pill{font-size:13px;font-weight:500;padding:8px 16px;border-radius:100px;border:1px solid var(--line);background:var(--card);color:var(--text-dim);display:flex;align-items:center;gap:6px}
.pill.hot{border-color:rgba(255,77,46,0.4);color:#ffd3c2;background:rgba(255,77,46,0.08)}
.ep-panel{border:1px solid var(--line);background:linear-gradient(180deg,var(--card),var(--bg-2));border-radius:16px;padding:22px 24px;margin-bottom:28px}
.ep-panel-top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px}
.ep-current{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px}
.ep-current .num{color:var(--sun)}
.ep-progress{font-size:12px;color:var(--text-dim)}
.ep-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.ep-scroll::-webkit-scrollbar{display:none}
.ep-chip{flex:0 0 auto;width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;border:1px solid var(--line);color:var(--text-dim);cursor:pointer;transition:all .18s ease;text-decoration:none}
.ep-chip:hover{border-color:var(--line-strong);color:var(--text)}
.ep-chip.active{background:linear-gradient(155deg,var(--sun),var(--ember));color:#1a0a05;border-color:transparent;box-shadow:0 0 16px -2px rgba(255,77,46,0.7)}
.actions{display:flex;gap:14px;flex-wrap:wrap}
.btn{font-family:'Inter',sans-serif;font-size:14.5px;font-weight:600;padding:15px 28px;border-radius:12px;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:10px;transition:transform .15s ease,box-shadow .15s ease;text-decoration:none}
.btn:active{transform:scale(0.97)}
.btn-primary{background:linear-gradient(120deg,var(--ember),var(--ember-deep));color:#fff;box-shadow:0 8px 30px -8px rgba(255,77,46,0.65)}
.btn-primary:hover{box-shadow:0 10px 36px -6px rgba(255,77,46,0.8)}
.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--line-strong)}
.btn-ghost:hover{border-color:var(--sun);color:var(--sun)}
.dl-section{margin-bottom:24px}
.dl-section-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;color:var(--sun);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.dl-links{display:flex;flex-direction:column;gap:8px}
.dl-link{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:12px;padding:14px 18px;text-decoration:none;color:var(--text);transition:all .2s ease}
.dl-link:hover{border-color:rgba(255,77,46,0.4);background:rgba(255,77,46,0.05);transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,77,46,0.1)}
.dl-quality{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:1px;color:var(--sun);min-width:60px}
.dl-server{flex:1;font-size:13px;color:var(--text-dim)}
.dl-link svg{color:var(--ember);flex-shrink:0}
.dl-link:hover svg{color:var(--sun)}
.no-links{background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:12px;padding:24px;text-align:center;color:var(--text-dim);font-size:14px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px}
.stat{border:1px solid var(--line);border-radius:14px;padding:16px 18px;background:rgba(255,255,255,0.02)}
.stat .val{font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--sun);letter-spacing:1px}
.stat .lbl{font-size:12px;color:var(--text-dim);margin-top:2px}
footer{text-align:center;color:var(--text-dim);font-size:12px;padding:20px 24px 40px;position:relative;z-index:2}
@media(max-width:820px){.layout{grid-template-columns:1fr}.poster-wrap{max-width:260px;margin:0 auto}h1{font-size:42px;text-align:center}.subtitle{margin:0 auto 24px;text-align:center}.meta-row,.actions{justify-content:center}.title-block{text-align:center}.ep-panel-top{flex-direction:column;align-items:center;gap:6px;text-align:center}.ep-scroll{justify-content:center}.dl-section-title{justify-content:center}.dl-links{align-items:center}.dl-link{max-width:360px;width:100%}.stats{grid-template-columns:repeat(3,1fr);max-width:400px;margin:36px auto 0}}
@media(max-width:420px){nav{padding:20px 16px 0}.brand{font-size:22px;letter-spacing:2px}main{padding:36px 16px 60px}.eyebrow{font-size:10px;padding:5px 12px}.poster-wrap{max-width:200px}h1{font-size:32px}.subtitle{font-size:13.5px;max-width:100%}.pill{font-size:12px;padding:6px 12px}.ep-panel{padding:16px 14px}.ep-current{font-size:18px}.ep-chip{width:36px;height:36px;font-size:12px}.actions{flex-direction:column;width:100%}.btn{width:100%;justify-content:center;padding:14px 20px;font-size:13.5px}.stats{grid-template-columns:1fr;max-width:280px;margin:24px auto 0}.stat{padding:12px 14px}.stat .val{font-size:22px}.dl-link{padding:12px 14px}}
@media(prefers-reduced-motion:no-preference){.poster-wrap{animation:float 5s ease-in-out infinite}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
:focus-visible{outline:2px solid var(--sun);outline-offset:2px}
</style>
</head>
<body>
<div class="noise"></div>
<nav>
  <div class="brand">anime<span>zilla</span></div>
</nav>
<main>
  <div class="eyebrow">download</div>
  <div class="layout">
    <div class="poster-wrap">
      <div class="poster">
        <span class="badge">HD \u00b7 1080p</span>
        <img src="{{COVER}}" alt="{{TITLE}}" />
      </div>
    </div>
    <div class="title-block">
      <h1>{{TITLE}}</h1>
      <p class="subtitle">{{DESCRIPTION}}</p>
      <div class="meta-row">
        {{RATING_PILL}}
        {{GENRES_PILLS}}
      </div>
      <div class="ep-panel">
        <div class="ep-panel-top">
          <div class="ep-current">episode <span class="num">{{EPISODE}}</span></div>
          <div class="ep-progress">{{EPISODE}} of {{TOTAL_EPS}} episodes</div>
        </div>
        <div class="ep-scroll">{{EP_SCROLL}}</div>
      </div>
      <div class="dl-section-wrap">{{DOWNLOAD_LINKS}}</div>
      <div class="actions" style="margin-top:24px">
        <a class="btn btn-primary" href="{{WATCH_URL}}" target="_blank"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Watch Now</a>
      </div>
      <div class="stats">
        <div class="stat"><div class="val">{{RATING}}</div><div class="lbl">Rating</div></div>
        <div class="stat"><div class="val">{{TOTAL_EPS}}</div><div class="lbl">Episodes</div></div>
        <div class="stat"><div class="val">{{FORMAT}}</div><div class="lbl">Format</div></div>
      </div>
    </div>
  </div>
</main>
<footer>animezilla \u2014 download</footer>
<script src="https://pl30409403.effectivecpmnetwork.com/7e/85/e9/7e85e9739d433e1f5510e0b86fb49aa3.js"></script>
</body>
</html>`;

function formatResult(source, meta) {
  return Object.assign({}, meta, {
    m3u8: source.sources && source.sources.file || null,
    tracks: (source.tracks || []).map(function(t) {
      return { file: t.file, label: t.label, kind: t.kind, default: t.default || false };
    }),
    intro: source.intro && source.intro.start ? source.intro : null,
    outro: source.outro && source.outro.start ? source.outro : null,
    server: source.server
  });
}

async function getSource(embedId, site) {
  var base = site === "vidtube" ? VIDTUBE_BASE : MEGAPLAY_BASE;
  var r = await fetch(base + "/stream/getSources?id=" + embedId, {
    headers: { "User-Agent": UA, "Referer": base + "/", "X-Requested-With": "XMLHttpRequest" }
  });
  if (!r.ok) throw new Error("getSources " + embedId + ": " + r.status);
  var d = await r.json();
  if (d.error) throw new Error(d.message || d.error);
  return d;
}

async function scrapeMegaplay(malId, episode) {
  var output = {};
  var base = { mal_id: String(malId), episode: episode };
  var results = await Promise.allSettled(["sub", "dub"].map(async function(lang) {
    var url = MEGAPLAY_BASE + "/stream/mal/" + malId + "/" + episode + "/" + lang;
    var r = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
    var html = await r.text();
    var match = html.match(/data-id="(\d+)"/);
    if (!match) throw new Error("No data-id");
    var source = await getSource(Number(match[1]), "megaplay");
    return Object.assign({ lang: lang }, formatResult(source, Object.assign({}, base, { source: "megaplay", dataId: Number(match[1]) })));
  }));
  for (var i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") output[results[i].value.lang] = results[i].value;
  }
  return output;
}

async function scrapeNekoStream(malId, episode) {
  var ts = Math.floor(Date.now() / 1000);
  var r1 = await fetch("https://mapper.nekostream.site/api/mal/" + malId + "/" + episode + "/" + ts, { headers: { "User-Agent": UA } });
  if (!r1.ok) throw new Error("Mapper " + r1.status);
  var servers = await r1.json();
  if (servers.error) throw new Error(servers.message || servers.error);
  var output = {};
  var base = { mal_id: String(malId), episode: episode };
  var entries = Object.entries(servers);
  for (var i = 0; i < entries.length; i++) {
    var serverName = entries[i][0];
    var data = entries[i][1];
    if (serverName === "status") continue;
    var displayName = serverName.replace(/-$/, "");
    var langs = ["sub", "dub"];
    for (var j = 0; j < langs.length; j++) {
      var lang = langs[j];
      if (data[lang] && data[lang].url && !output[lang]) {
        try {
          var r2 = await fetch("https://anikototv.to/ajax/server?get=" + encodeURIComponent(data[lang].url), {
            headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": "https://anikototv.to/" }
          });
          var d2 = await r2.json();
          if (d2.status !== 200 || !d2.result || !d2.result.url) continue;
          var playerUrl = d2.result.url;
          var hash = playerUrl.split("#")[1];
          if (!hash) continue;
          var m3u8 = fromBase64(hash);
          if (!m3u8.includes(".m3u8")) continue;
          var skip = d2.result.skip_data;
          output[lang] = Object.assign({}, base, {
            m3u8: m3u8, server: displayName, source: "nekostream", tracks: [],
            intro: skip && skip.intro && skip.intro[0] ? { start: skip.intro[0], end: skip.intro[1] } : null,
            outro: skip && skip.outro && skip.outro[0] ? { start: skip.outro[0], end: skip.outro[1] } : null
          });
        } catch (e) {}
      }
    }
  }
  return output;
}

async function scrapeBoth(malId, episode) {
  var cacheKey = "mp-" + malId + "-" + episode;
  var cached = getScrapeCache(cacheKey);
  if (cached) return cached;

  var results = await Promise.allSettled([scrapeMegaplay(malId, episode), scrapeNekoStream(malId, episode)]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      var data = results[i].value;
      if (data && Object.keys(data).length > 0) {
        cacheScrape(cacheKey, data);
        return data;
      }
    }
  }
  throw new Error("MAL " + malId + " ep " + episode + ": no sources");
}

function parseDownloadHtml(html) {
  var result = { sub: [], dub: [] };
  var currentSection = "sub";
  var sections = html.split(/<div class="dl-section-header">/);
  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    if (section.includes("SUBTITLED")) currentSection = "sub";
    else if (section.includes("DUBBED")) currentSection = "dub";
    var links = section.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="dl-bubble-item"[^>]*>([\s\S]*?)<\/a>/g);
    for (var match of links) {
      var url = match[1];
      var inner = match[2];
      var isBest = inner.includes("dl-best-badge");
      var qualityMatch = inner.match(/dl-bubble-text[^>]*>([^<]+)/);
      var quality = qualityMatch ? qualityMatch[1].trim() : "Default";
      result[currentSection].push({ url: url, quality: quality, best: isBest });
    }
  }
  return result;
}

async function getFrom9Anime(malId, episode) {
  var r = await fetch("https://9anime.org.lv/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: "action=fetch_download_links&mal_id=" + malId + "&ep=" + episode
  });
  if (!r.ok) throw new Error("9anime " + r.status);
  var d = await r.json();
  if (!d.success || !d.data || d.data.status !== 200 || !d.data.result) throw new Error("No links");
  return parseDownloadHtml(d.data.result);
}

async function getFromNekoStreamDL(malId, episode) {
  var ts = Math.floor(Date.now() / 1000);
  var r = await fetch("https://mapper.nekostream.site/api/mal/" + malId + "/" + episode + "/" + ts, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("Mapper " + r.status);
  var servers = await r.json();
  if (servers.error) throw new Error(servers.message || servers.error);
  var result = { sub: [], dub: [] };
  var entries = Object.entries(servers);
  for (var i = 0; i < entries.length; i++) {
    var name = entries[i][0];
    var data = entries[i][1];
    if (name === "status") continue;
    var langs = ["sub", "dub"];
    for (var j = 0; j < langs.length; j++) {
      var lang = langs[j];
      if (data[lang] && data[lang].download) {
        var dlEntries = Object.entries(data[lang].download);
        for (var k = 0; k < dlEntries.length; k++) {
          var server = dlEntries[k][0];
          var dlUrl = dlEntries[k][1];
          var code = extractCodeFromUrl(dlUrl);
          if (code) result[lang].push({ url: dlUrl, quality: "Default", best: false, source: server, code: code });
        }
      }
    }
  }
  return result;
}

async function getDownloadLinks(malId, episode) {
  var result = { sub: [], dub: [] };

  var [a9Result, nekoResult] = await Promise.allSettled([
    getFrom9Anime(malId, episode),
    getFromNekoStreamDL(malId, episode)
  ]);

  if (a9Result.status === "fulfilled" && a9Result.value) {
    var a9 = a9Result.value;
    var langs = ["sub", "dub"];
    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i];
      for (var j = 0; j < a9[lang].length; j++) {
        var link = a9[lang][j];
        var code = link.url.split("/").pop();
        result[lang].push(Object.assign({}, link, { code: code, source: "9anime", workerUrls: buildWorkerUrl(code) }));
      }
    }
  }

  if (nekoResult.status === "fulfilled" && nekoResult.value) {
    var neko = nekoResult.value;
    var langs2 = ["sub", "dub"];
    for (var i2 = 0; i2 < langs2.length; i2++) {
      var lang2 = langs2[i2];
      for (var j2 = 0; j2 < neko[lang2].length; j2++) {
        var link2 = neko[lang2][j2];
        var exists = result[lang2].some(function(x) { return x.code === link2.code; });
        if (!exists) result[lang2].push(Object.assign({}, link2, { source: "nekostream", workerUrls: buildWorkerUrl(link2.code) }));
      }
    }
  }

  if (result.sub.length === 0 && result.dub.length === 0) {
    throw new Error("No download links for MAL " + malId + " ep " + episode);
  }
  return result;
}

async function getDownloadLinksCached(malId, ep) {
  var key = "dl-" + malId + "-" + ep;
  var cached = getScrapeCache(key);
  if (cached) return cached;
  try {
    var data = await getDownloadLinks(malId, ep);
    cacheScrape(key, data);
    return data;
  } catch (e) { return null; }
}

const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Player</title>
<script src="/api/hls.js"></script>
<style>
  * { box-sizing: border-box; }
  html,body{
    margin:0; padding:0; width:100%; height:100%;
    background: radial-gradient(ellipse at 50% 0%, #1a0505 0%, #060202 70%);
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color:#ffe6e8;
    overflow:hidden;
  }
  :root{
    --red: #ff1e3c;
    --red-dim: #7a0f1e;
    --red-glow: rgba(255,30,60,0.55);
    --red-glow-soft: rgba(255,30,60,0.22);
    --text-dim: #b98a8e;
    --border: rgba(255,30,60,0.25);
  }
  body::before{
    content:"";
    position:fixed; inset:0;
    background-image:
      radial-gradient(circle at 15% 20%, rgba(255,30,60,0.08), transparent 40%),
      radial-gradient(circle at 85% 80%, rgba(255,30,60,0.10), transparent 40%);
    pointer-events:none;
    z-index:0;
  }

  .player-shell{
    position:relative;
    width:100vw; height:100vh;
    background: linear-gradient(160deg, #140808, #0c0404 70%);
    padding:0;
  }
  .player-shell::before{
    content:"";
    position:absolute; inset:0;
    z-index:2;
    pointer-events:none;
    box-shadow:
      inset 0 0 60px rgba(255,20,45,0.10),
      inset 0 0 140px rgba(255,20,45,0.06);
  }

  .video-area{
    position:relative;
    width:100%;
    height:100%;
    background:#000;
    overflow:hidden;
  }
  video{
    width:100%; height:100%;
    display:block;
    background:#000;
    object-fit: contain;
  }

  .glow-frame{
    position:absolute; inset:0;
    pointer-events:none;
    box-shadow: inset 0 0 90px rgba(0,0,0,0.55), inset 0 0 3px rgba(255,30,60,0.4);
  }

  .center-play{
    position:absolute; top:50%; left:50%;
    transform: translate(-50%,-50%);
    width:84px; height:84px;
    border-radius:50%;
    background: radial-gradient(circle at 35% 30%, #ff3b54, #7a0f1e 75%);
    box-shadow: 0 0 30px var(--red-glow), 0 0 65px var(--red-glow-soft);
    display:flex; align-items:center; justify-content:center;
    cursor:pointer;
    opacity:0.95;
    transition: transform .18s ease, opacity .18s ease;
    z-index:5;
  }
  .center-play:hover{ transform: translate(-50%,-50%) scale(1.08); }
  .center-play svg{ width:30px; height:30px; fill:#fff; margin-left:4px; }
  .center-play.hidden{ opacity:0; pointer-events:none; }

  .skip-btn{position:absolute;top:18px;right:22px;background:rgba(255,30,60,0.2);border:1px solid rgba(255,30,60,0.35);color:#ffe6e8;border-radius:8px;padding:8px 18px;font:bold 12px 'Segoe UI',sans-serif;cursor:pointer;z-index:10;display:none;text-transform:uppercase;letter-spacing:1.5px;transition:background .15s,box-shadow .15s;backdrop-filter:blur(4px)}
  .skip-btn:hover{background:rgba(255,30,60,0.45);box-shadow:0 0 16px var(--red-glow-soft)}
  .skip-btn.show{display:block}

  .loading{
    position:absolute; top:50%; left:50%;
    transform: translate(-50%,-50%);
    width:50px; height:50px;
    border-radius:50%;
    border: 3px solid rgba(255,30,60,0.2);
    border-top-color: var(--red);
    animation: spin 0.9s linear infinite;
    display:none;
    z-index:6;
    box-shadow: 0 0 18px var(--red-glow-soft);
  }
  .loading.active{ display:block; }

  .brand-mini{
    position:absolute; top:18px; left:22px;
    display:flex; align-items:center; gap:8px;
    z-index:7;
    opacity:0;
    transition: opacity .25s ease;
  }
  .video-area:hover .brand-mini,
  .video-area.show-controls .brand-mini,
  .video-area.paused-state .brand-mini{ opacity:1; }
  .brand-mini .mark{
    width:11px; height:11px;
    background: var(--red);
    border-radius:3px;
    transform: rotate(45deg);
    box-shadow: 0 0 10px var(--red-glow);
    animation: pulse 2.4s ease-in-out infinite;
  }
  .brand-mini span{
    font-size:12px; letter-spacing:2px; text-transform:uppercase;
    color:#ffe6e8; text-shadow:0 0 10px rgba(255,30,60,0.4);
  }

  .controls{
    position:absolute; left:0; right:0; bottom:0;
    padding: 12px 22px 16px;
    background: linear-gradient(to top, rgba(6,2,2,0.92) 0%, rgba(6,2,2,0.7) 50%, transparent 100%);
    opacity:0;
    transform: translateY(6px);
    transition: opacity .25s ease, transform .25s ease;
    z-index:7;
  }
  .video-area:hover .controls,
  .video-area.show-controls .controls,
  .video-area.paused-state .controls{
    opacity:1;
    transform: translateY(0);
  }

  .video-area.hide-cursor{cursor:none}
  .video-area.hide-cursor .controls,.video-area.hide-cursor .brand-mini,.video-area.hide-cursor .skip-btn{opacity:0;pointer-events:none}

  .seek-row{
    display:flex; align-items:center; gap:10px;
    margin-bottom:10px;
  }
  .time{
    font-size:12px; color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    min-width:42px;
    text-align:center;
  }
  input[type=range]{
    -webkit-appearance:none; appearance:none;
    width:100%; height:4px;
    background: rgba(255,255,255,0.12);
    border-radius: 3px;
    outline:none;
    cursor:pointer;
  }
  #seek{
    background: linear-gradient(to right, var(--red) 0%, var(--red) 0%, rgba(255,255,255,0.12) 0%);
  }
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none;
    width:14px; height:14px;
    border-radius:50%;
    background: var(--red);
    box-shadow: 0 0 8px var(--red-glow), 0 0 16px var(--red-glow-soft);
    cursor:pointer;
    border: 2px solid #1a0505;
    margin-top:-1px;
  }
  input[type=range]::-moz-range-thumb{
    width:14px; height:14px;
    border-radius:50%;
    background: var(--red);
    box-shadow: 0 0 8px var(--red-glow);
    border: 2px solid #1a0505;
    cursor:pointer;
  }
  input[type=range]::-moz-range-track{
    background: rgba(255,255,255,0.12);
    height:4px; border-radius:3px;
  }

  .btn-row{
    display:flex; align-items:center; gap:6px;
  }
  .btn-row .spacer{ flex:1; }

  .ctrl-btn{
    background:transparent;
    border:none;
    color: #ffe6e8;
    width:36px; height:36px;
    border-radius:8px;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer;
    transition: background .15s ease, box-shadow .15s ease, color .15s ease;
  }
  .ctrl-btn:hover{
    background: rgba(255,30,60,0.14);
    box-shadow: 0 0 12px rgba(255,30,60,0.25);
    color:#fff;
  }
  .ctrl-btn svg{ width:19px; height:19px; fill: currentColor; }

  .vol-wrap{
    display:flex; align-items:center; gap:6px;
    width:36px;
    overflow:hidden;
    transition: width .25s ease;
  }
  .vol-wrap:hover, .vol-wrap.active{ width:112px; }
  #volume{ width:70px; }

  .settings-wrap{ position:relative; }
  .ctrl-btn.settings-open{
    background: rgba(255,30,60,0.14);
    color:#fff;
  }

  .settings-menu{
    position:absolute;
    bottom: 46px;
    right: 0;
    width: 220px;
    background: #150707;
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 0 0 1px rgba(255,30,60,0.08), 0 8px 30px rgba(0,0,0,0.6), 0 0 30px rgba(255,20,45,0.15);
    overflow: hidden;
    z-index: 20;
    opacity: 0;
    transform: translateY(6px);
    pointer-events: none;
    transition: opacity .16s ease, transform .16s ease;
  }
  .settings-menu.open{
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .menu-panel{display:none;max-height:260px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--red-dim) transparent}
  .menu-panel::-webkit-scrollbar{width:4px}
  .menu-panel::-webkit-scrollbar-thumb{background:var(--red-dim);border-radius:2px}
  .menu-panel::-webkit-scrollbar-track{background:transparent}
  .menu-panel.active{display:block}

  .menu-item{
    display:flex; align-items:center; justify-content:space-between;
    gap:10px;
    padding: 11px 14px;
    font-size: 13px;
    color:#ffe6e8;
    cursor:pointer;
    transition: background .12s ease;
  }
  .menu-item:hover{ background: rgba(255,30,60,0.12); }
  .menu-item .left{ display:flex; align-items:center; gap:10px; }
  .menu-item .left svg{ width:16px; height:16px; fill: var(--text-dim); }
  .menu-item .val{ color: var(--text-dim); font-size:12px; }
  .menu-item .chev{ width:14px; height:14px; fill: var(--text-dim); }

  .menu-header{
    display:flex; align-items:center; gap:8px;
    padding: 11px 14px;
    font-size: 13px;
    font-weight:600;
    color:#ffe6e8;
    cursor:pointer;
    border-bottom: 1px solid var(--border);
  }
  .menu-header svg{ width:16px; height:16px; fill: var(--text-dim); }

  .option-row{
    display:flex; align-items:center; justify-content:space-between;
    padding: 10px 14px 10px 30px;
    font-size: 13px;
    color: var(--text-dim);
    cursor:pointer;
    transition: background .12s ease, color .12s ease;
  }
  .option-row:hover{ background: rgba(255,30,60,0.10); color:#ffe6e8; }
  .option-row.selected{ color: var(--red); font-weight:600; }
  .option-row .dot{
    width:6px; height:6px; border-radius:50%;
    background: var(--red);
    box-shadow: 0 0 6px var(--red-glow);
    opacity:0;
  }
  .option-row.selected .dot{ opacity:1; }

  .time-label{
    font-size:11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    padding: 0 8px;
    min-width:92px;
  }

  @keyframes pulse{
    0%,100%{ box-shadow: 0 0 10px var(--red-glow), 0 0 22px var(--red-glow-soft); }
    50%{ box-shadow: 0 0 16px var(--red-glow), 0 0 34px var(--red-glow-soft); }
  }
  @keyframes spin{ to{ transform: translate(-50%,-50%) rotate(360deg); } }

  ::selection{ background: var(--red-dim); color:#fff; }

  @media (max-width:560px){
    .time-label{ display:none; }
    .center-play{ width:64px; height:64px; }
  }
</style>
</head>
<body>

<div class="player-shell">
  <div class="video-area" id="videoArea">
    <video id="video" playsinline></video>
    <div class="glow-frame"></div>
    <div class="loading" id="loading"></div>

    <div class="brand-mini">
      <div class="mark"></div>
      <span id="animeName">Player</span>
    </div>

    <div class="center-play" id="centerPlay">
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    </div>

    <div class="skip-btn" id="skipBtn">Skip</div>

    <div class="controls" id="controls">
      <div class="seek-row">
        <span class="time" id="curTime">0:00</span>
        <input type="range" id="seek" min="0" max="100" value="0" step="0.1">
        <span class="time" id="durTime">0:00</span>
      </div>
      <div class="btn-row">
        <button class="ctrl-btn" id="playBtn" title="Play/Pause">
          <svg viewBox="0 0 24 24" id="playIcon"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="ctrl-btn" id="skipBack" title="-10s">
          <svg viewBox="0 0 24 24"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
        </button>
        <button class="ctrl-btn" id="skipFwd" title="+10s">
          <svg viewBox="0 0 24 24"><path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/></svg>
        </button>

        <div class="vol-wrap" id="volWrap">
          <button class="ctrl-btn" id="muteBtn" title="Mute">
            <svg viewBox="0 0 24 24" id="volIcon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          </button>
          <input type="range" id="volume" min="0" max="100" value="100">
        </div>

        <span class="time-label" id="statusTag">— idle —</span>

        <div class="spacer"></div>

        <div class="settings-wrap">
          <button class="ctrl-btn" id="settingsBtn" title="Settings">
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.63c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </button>

          <div class="settings-menu" id="settingsMenu">
            <div class="menu-panel active" id="panelMain">
              <div class="menu-item" data-target="panelSpeed">
                <div class="left">
                  <svg viewBox="0 0 24 24"><path d="M13 2.05v3.03c3.39.49 6 3.39 6 6.92 0 .9-.18 1.75-.48 2.54l2.6 1.53c.56-1.24.88-2.62.88-4.07 0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V2.05c-5.06.5-9 4.76-9 9.95 0 5.52 4.47 10 9.99 10 3.31 0 6.24-1.61 8.06-4.09l-2.6-1.53C17.15 17.92 14.72 19 12 19zm1-13h-2v6l4.28 2.54.72-1.21-3-1.83V6z"/></svg>
                  <span>Playback speed</span>
                </div>
                <div class="val" id="speedVal">1x</div>
              </div>
              <div class="menu-item" data-target="panelQuality">
                <div class="left">
                  <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 12l2.5 3.01L14 10l4 6H6l2-4z"/></svg>
                  <span>Quality</span>
                </div>
                <div class="val" id="qualityVal">Auto</div>
              </div>
              <div class="menu-item" data-target="panelSub">
                <div class="left">
                  <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z"/></svg>
                  <span>Subtitles</span>
                </div>
                <div class="val" id="subVal">Off</div>
              </div>
            </div>

            <div class="menu-panel" id="panelSpeed">
              <div class="menu-header" data-target="panelMain">
                <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                <span>Playback speed</span>
              </div>
              <div class="option-row" data-speed="0.5"><span>0.5x</span><span class="dot"></span></div>
              <div class="option-row" data-speed="0.75"><span>0.75x</span><span class="dot"></span></div>
              <div class="option-row selected" data-speed="1"><span>Normal</span><span class="dot"></span></div>
              <div class="option-row" data-speed="1.25"><span>1.25x</span><span class="dot"></span></div>
              <div class="option-row" data-speed="1.5"><span>1.5x</span><span class="dot"></span></div>
              <div class="option-row" data-speed="2"><span>2x</span><span class="dot"></span></div>
            </div>

            <div class="menu-panel" id="panelQuality">
              <div class="menu-header" data-target="panelMain">
                <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                <span>Quality</span>
              </div>
              <div id="qualityOptions">
                <div class="option-row selected" data-quality="-1"><span>Auto</span><span class="dot"></span></div>
              </div>
            </div>

            <div class="menu-panel" id="panelSub">
              <div class="menu-header" data-target="panelMain">
                <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                <span>Subtitles</span>
              </div>
              <div id="subOptions">
                <div class="option-row selected" data-sub="-1"><span>Off</span><span class="dot"></span></div>
              </div>
            </div>
          </div>
        </div>

        <button class="ctrl-btn" id="pipBtn" title="Picture in picture">
          <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.02H3V4.98h18v14.04z"/></svg>
        </button>
        <button class="ctrl-btn" id="fullBtn" title="Fullscreen">
          <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        </button>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var cfg={m3u8:null,tracks:[],intro:null,outro:null,title:""};
  try{cfg=window.__PLAYER_CONFIG__||cfg}catch(e){}

  const video = document.getElementById('video');
  const videoArea = document.getElementById('videoArea');
  const centerPlay = document.getElementById('centerPlay');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const seek = document.getElementById('seek');
  const curTime = document.getElementById('curTime');
  const durTime = document.getElementById('durTime');
  const volume = document.getElementById('volume');
  const volWrap = document.getElementById('volWrap');
  const muteBtn = document.getElementById('muteBtn');
  const volIcon = document.getElementById('volIcon');
  const pipBtn = document.getElementById('pipBtn');
  const fullBtn = document.getElementById('fullBtn');
  const skipBack = document.getElementById('skipBack');
  const skipFwd = document.getElementById('skipFwd');
  const loading = document.getElementById('loading');
  const statusTag = document.getElementById('statusTag');
  const skipBtn = document.getElementById('skipBtn');

  if(cfg.title){document.getElementById("animeName").textContent=cfg.title;document.title=cfg.title+" - Player"}

  const PLAY_SVG='<path d="M8 5v14l11-7z"/>';
  const PAUSE_SVG='<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  const VOL_SVG='<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  const MUTE_SVG='<path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';

  function fmt(s){
    if(!isFinite(s)||s<0)s=0;
    const m=Math.floor(s/60);
    const sec=Math.floor(s%60).toString().padStart(2,'0');
    return m+':'+sec;
  }
  function setTag(msg){statusTag.textContent=msg;}

  const settingsBtn=document.getElementById('settingsBtn');
  const settingsMenu=document.getElementById('settingsMenu');
  const panelMain=document.getElementById('panelMain');
  const panelSpeed=document.getElementById('panelSpeed');
  const panelQuality=document.getElementById('panelQuality');
  const panelSub=document.getElementById('panelSub');
  const speedVal=document.getElementById('speedVal');
  const qualityVal=document.getElementById('qualityVal');
  const qualityOptions=document.getElementById('qualityOptions');
  const subVal=document.getElementById('subVal');
  const subOptions=document.getElementById('subOptions');

  function showPanel(id){
    [panelMain,panelSpeed,panelQuality,panelSub].forEach(function(p){p.classList.remove('active')});
    document.getElementById(id).classList.add('active');
  }
  document.querySelectorAll('.menu-item[data-target],.menu-header[data-target]').forEach(function(el){
    el.addEventListener('click',function(){showPanel(el.getAttribute('data-target'))});
  });

  settingsBtn.addEventListener('click',function(e){
    e.stopPropagation();
    const isOpen=settingsMenu.classList.toggle('open');
    settingsBtn.classList.toggle('settings-open',isOpen);
    if(isOpen)showPanel('panelMain');
  });
  document.addEventListener('click',function(e){
    if(!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
      settingsMenu.classList.remove('open');
      settingsBtn.classList.remove('settings-open');
    }
  });

  document.querySelectorAll('#panelSpeed .option-row').forEach(function(row){
    row.addEventListener('click',function(){
      const rate=parseFloat(row.getAttribute('data-speed'));
      video.playbackRate=rate;
      speedVal.textContent=rate===1?'1x':rate+'x';
      document.querySelectorAll('#panelSpeed .option-row').forEach(function(r){r.classList.remove('selected')});
      row.classList.add('selected');
      settingsMenu.classList.remove('open');
      settingsBtn.classList.remove('settings-open');
    });
  });

  function closeMenu(){settingsMenu.classList.remove('open');settingsBtn.classList.remove('settings-open')}

  let hls=null;
  const src=cfg.m3u8;

  function initSubs(){
    var tracks=cfg.tracks||[];
    var subTracks=tracks.filter(function(t){return t.kind==="captions"||t.kind==="subtitles"});
    subTracks.forEach(function(trk,i){
      var el=document.createElement("track");el.kind=trk.kind;el.src=trk.file;el.label=trk.label||"Sub "+(i+1);el.srclang=trk.label?trk.label.substring(0,2).toLowerCase():"en";if(trk.default)el.default=true;video.appendChild(el);
    });
    subOptions.innerHTML='<div class="option-row selected" data-sub="-1"><span>Off</span><span class="dot"></span></div>';
    subTracks.forEach(function(trk,i){
      var row=document.createElement("div");row.className="option-row";row.setAttribute("data-sub",String(i));
      row.innerHTML='<span>'+((trk.label||"Sub "+(i+1)).replace(/</g,"&lt;"))+'</span><span class="dot"></span>';
      subOptions.appendChild(row);
    });
    if(subTracks.length>0){subVal.textContent=subTracks.length+" Track"+(subTracks.length>1?"s":"")}
    subOptions.querySelectorAll(".option-row").forEach(function(row){
      row.addEventListener("click",function(){
        var idx=parseInt(row.getAttribute("data-sub"),10);
        for(var j=0;j<video.textTracks.length;j++){video.textTracks[j].mode=idx===j?"showing":"hidden"}
        subVal.textContent=idx===-1?"Off":(row.querySelector("span").textContent||"Track "+(idx+1));
        subOptions.querySelectorAll(".option-row").forEach(function(r){r.classList.remove("selected")});row.classList.add("selected");closeMenu();
      });
    });
  }

  function togglePlay(){
    if(video.paused||video.ended){video.play()}
    else{video.pause()}
  }
  centerPlay.addEventListener('click',togglePlay);
  playBtn.addEventListener('click',togglePlay);
  video.addEventListener('click',togglePlay);

  video.addEventListener('play',function(){
    playIcon.innerHTML=PAUSE_SVG;
    centerPlay.classList.add('hidden');
    videoArea.classList.remove('paused-state');
    setTag('playing');
  });
  video.addEventListener('pause',function(){
    playIcon.innerHTML=PLAY_SVG;
    centerPlay.classList.remove('hidden');
    videoArea.classList.add('paused-state');
    setTag('paused');
  });
  video.addEventListener('waiting',function(){loading.classList.add('active');setTag('buffering…')});
  video.addEventListener('playing',function(){loading.classList.remove('active');setTag('playing')});
  video.addEventListener('ended',function(){setTag('ended');centerPlay.classList.remove('hidden')});

  video.addEventListener('timeupdate',function(){
    if(!isFinite(video.duration))return;
    const pct=(video.currentTime/video.duration)*100;
    seek.value=pct;
    seek.style.background='linear-gradient(to right, var(--red) '+pct+'%, rgba(255,255,255,0.12) '+pct+'%)';
    curTime.textContent=fmt(video.currentTime);
    checkSkip();
  });
  video.addEventListener('loadedmetadata',function(){
    durTime.textContent=fmt(video.duration);
  });
  seek.addEventListener('input',function(){
    if(isFinite(video.duration)){
      video.currentTime=(seek.value/100)*video.duration;
    }
  });

  function checkSkip(){
    var t=video.currentTime;
    if(cfg.intro&&cfg.intro.start!==cfg.intro.end&&t>=cfg.intro.start&&t<cfg.intro.end){skipBtn.textContent="Skip Intro";skipBtn.classList.add("show");return}
    if(cfg.outro&&cfg.outro.start!==cfg.outro.end&&t>=cfg.outro.start&&t<cfg.outro.end){skipBtn.textContent="Skip Outro";skipBtn.classList.add("show");return}
    skipBtn.classList.remove("show");
  }
  skipBtn.addEventListener("click",function(){
    var t=video.currentTime;
    if(cfg.intro&&t>=cfg.intro.start&&t<cfg.intro.end)video.currentTime=cfg.intro.end;
    else if(cfg.outro&&t>=cfg.outro.start&&t<cfg.outro.end)video.currentTime=cfg.outro.end;
  });

  skipBack.addEventListener('click',function(){video.currentTime=Math.max(0,video.currentTime-10)});
  skipFwd.addEventListener('click',function(){video.currentTime=Math.min(video.duration||1e9,video.currentTime+10)});

  volume.addEventListener('input',function(){
    video.volume=volume.value/100;
    video.muted=video.volume===0;
    volIcon.innerHTML=video.muted?MUTE_SVG:VOL_SVG;
  });
  muteBtn.addEventListener('click',function(){
    video.muted=!video.muted;
    volIcon.innerHTML=video.muted?MUTE_SVG:VOL_SVG;
    if(!video.muted&&video.volume===0){video.volume=1;volume.value=100}
  });
  volWrap.addEventListener('mouseenter',function(){volWrap.classList.add('active')});
  volWrap.addEventListener('mouseleave',function(){volWrap.classList.remove('active')});

  pipBtn.addEventListener('click',async function(){
    try{
      if(document.pictureInPictureElement){await document.exitPictureInPicture()}
      else{await video.requestPictureInPicture()}
    }catch(e){}
  });

  fullBtn.addEventListener('click',function(){
    if(!document.fullscreenElement){videoArea.requestFullscreen().catch(function(){})}
    else{document.exitFullscreen()}
  });

  document.addEventListener("fullscreenchange", function() {
    if (document.fullscreenElement === videoArea) {
      if (screen.orientation && typeof screen.orientation.lock === "function") {
        screen.orientation.lock("landscape").catch(function(err) {
          console.log("Orientation lock error:", err);
        });
      }
    } else {
      if (screen.orientation && typeof screen.orientation.unlock === "function") {
        try { screen.orientation.unlock(); } catch(e) {}
      }
    }
  });

  document.addEventListener('keydown',function(e){
    if(e.code==='Space'){e.preventDefault();togglePlay()}
    if(e.code==='ArrowRight'){video.currentTime+=5}
    if(e.code==='ArrowLeft'){video.currentTime-=5}
    if(e.code==='ArrowUp'){e.preventDefault();volume.value=Math.min(100,+volume.value+5);volume.dispatchEvent(new Event('input'))}
    if(e.code==='ArrowDown'){e.preventDefault();volume.value=Math.max(0,+volume.value-5);volume.dispatchEvent(new Event('input'))}
    if(e.key==='f'||e.key==='F'){fullBtn.click()}
    if(e.key==='m'||e.key==='M'){muteBtn.click()}
  });

  var hideTimer=null;
  function showControls(){videoArea.classList.remove('hide-cursor');clearTimeout(hideTimer);hideTimer=setTimeout(function(){if(!video.paused){videoArea.classList.add('hide-cursor')}},3000)}
  videoArea.addEventListener('mousemove',showControls);
  videoArea.addEventListener('mousedown',showControls);
  videoArea.addEventListener('touchstart',showControls);
  videoArea.addEventListener('mouseenter',showControls);
  video.addEventListener('pause',function(){videoArea.classList.remove('hide-cursor');clearTimeout(hideTimer)});
  video.addEventListener('play',function(){hideTimer=setTimeout(function(){videoArea.classList.add('hide-cursor')},3000)});
  showControls();

  if(src&&src.length>0){
    if(src.includes('.m3u8')){
      if(Hls.isSupported()){
        hls=new Hls({startLevel:-1,capLevelToPlayerSize:true,maxBufferLength:30,maxMaxBufferLength:60,startFragPrefetch:true});
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED,function(){
          setTag('ready');
          initSubs();
          if(hls.levels&&hls.levels.length>=1){
            hls.levels.forEach(function(lvl,i){
              var label=lvl.height?lvl.height+'p':Math.round(lvl.bitrate/1000)+'kbps';
              var row=document.createElement('div');
              row.className='option-row';
              row.setAttribute('data-quality',i);
              row.innerHTML='<span>'+label+'</span><span class="dot"></span>';
              qualityOptions.appendChild(row);
            });
          }
        });
        hls.on(Hls.Events.LEVEL_SWITCHED,function(){});
        hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){if(d.type===Hls.ErrorTypes.NETWORK_ERROR){setTag("reconnecting...");hls.startLoad()}else if(d.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError()}}})
      }else if(video.canPlayType('application/vnd.apple.mpegurl')){
        video.src=src;initSubs()
      }else{
        setTag('HLS not supported')
      }
    }else{
      video.src=src;initSubs()
    }
  }else{
    setTag('No source available')
  }

  qualityOptions.addEventListener('click',function(e){
    var row=e.target.closest('.option-row');if(!row)return;
    var level=parseInt(row.getAttribute('data-quality'),10);
    if(hls){hls.currentLevel=level}
    qualityVal.textContent=row.querySelector('span').textContent;
    document.querySelectorAll('#qualityOptions .option-row').forEach(function(r){r.classList.remove('selected')});row.classList.add('selected');closeMenu()
  });

  // sub option rows are now bound dynamically in initSubs()
})();
</script>
</body>
</html>`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

async function fetchAnilistInfo(anilistId) {
  var cacheKey = "al-" + anilistId;
  var cached = getScrapeCache(cacheKey);
  if (cached && cached.title && cached.malId) return cached;
  if (cached && cached.title && !cached.malId) {
    try {
      var ar = await fetch("https://anikage.cc/api/media/anime/" + anilistId, { headers: { "User-Agent": UA } });
      if (ar.ok) { var ad = await ar.json(); if (ad && ad.anime && ad.anime.malId) { cached.malId = ad.anime.malId; cacheScrape(cacheKey, cached); return cached; } }
    } catch {}
  }
  try {
    var wGql = JSON.stringify({ query: "{ Media(id:" + anilistId + ",type:ANIME){ idMal title{romaji english} } }" });
    var wGr = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" }, body: wGql });
    var wGd = await wGr.json();
    var wGm = wGd.data && wGd.data.Media;
    if (wGm) {
      var info = { malId: wGm.idMal, title: (wGm.title && (wGm.title.english || wGm.title.romaji)) || "" };
      cacheScrape(cacheKey, info);
      return info;
    }
  } catch {}
  try {
    var ar2 = await fetch("https://anikage.cc/api/media/anime/" + anilistId, { headers: { "User-Agent": UA } });
    if (ar2.ok) { var ad2 = await ar2.json(); if (ad2 && ad2.anime) { var info2 = { malId: ad2.anime.malId || null, title: ad2.anime.title && (ad2.anime.title.english || ad2.anime.title.romaji) || "" }; cacheScrape(cacheKey, info2); return info2; } }
  } catch {}
  return { malId: null, title: "" };
}

async function findAnikotoEmbedUrl(aniId, ep, lang) {
  var cacheKey = "ak-" + aniId + "-" + ep + "-" + lang;
  var cached = getScrapeCache(cacheKey);
  if (cached !== undefined) return cached || null;

  try {
    var found = false;
    var seriesId = null;
    for (var page = 1; page <= 5; page++) {
      var listRes = await fetch(ANIKOTO_API_BASE + "/recent-anime?page=" + page + "&per_page=100", { headers: ANIKOTO_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!listRes.ok) break;
      var listData = await listRes.json();
      if (!listData.ok || !listData.data || listData.data.length === 0) break;
      for (var i = 0; i < listData.data.length; i++) {
        if (String(listData.data[i].ani_id) === String(aniId)) {
          seriesId = listData.data[i].id;
          found = true;
          break;
        }
      }
      if (found) break;
      if (listData.pagination && listData.pagination.page >= listData.pagination.total_pages) break;
    }
    if (!seriesId) { cacheScrape(cacheKey, false); return null; }

    var seriesRes = await fetch(ANIKOTO_API_BASE + "/series/" + seriesId, { headers: ANIKOTO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!seriesRes.ok) { cacheScrape(cacheKey, false); return null; }
    var seriesData = await seriesRes.json();
    if (!seriesData.ok || !seriesData.data || !seriesData.data.episodes) { cacheScrape(cacheKey, false); return null; }

    var episodes = seriesData.data.episodes;
    var targetEp = null;
    for (var j = 0; j < episodes.length; j++) {
      if (Number(episodes[j].number) === Number(ep)) { targetEp = episodes[j]; break; }
    }
    if (!targetEp || !targetEp.embed_url) { cacheScrape(cacheKey, false); return null; }

    var embedUrl = targetEp.embed_url[lang];
    if (!embedUrl) { cacheScrape(cacheKey, false); return null; }

    cacheScrape(cacheKey, embedUrl);
    return embedUrl;
  } catch (e) {
    cacheScrape(cacheKey, false);
    return null;
  }
}

async function checkAnikotoAvailability(aniId, ep) {
  var cacheKey = "ak-av-" + aniId + "-" + ep;
  var cached = getScrapeCache(cacheKey);
  if (cached !== undefined) return cached;

  try {
    var found = false;
    var seriesId = null;
    for (var page = 1; page <= 3; page++) {
      var listRes = await fetch(ANIKOTO_API_BASE + "/recent-anime?page=" + page + "&per_page=100", { headers: ANIKOTO_HEADERS, signal: AbortSignal.timeout(5000) });
      if (!listRes.ok) break;
      var listData = await listRes.json();
      if (!listData.ok || !listData.data || listData.data.length === 0) break;
      for (var i = 0; i < listData.data.length; i++) {
        if (String(listData.data[i].ani_id) === String(aniId)) {
          seriesId = listData.data[i].id;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!seriesId) { cacheScrape(cacheKey, { sub: false, dub: false }); return { sub: false, dub: false }; }

    var seriesRes = await fetch(ANIKOTO_API_BASE + "/series/" + seriesId, { headers: ANIKOTO_HEADERS, signal: AbortSignal.timeout(5000) });
    if (!seriesRes.ok) { cacheScrape(cacheKey, { sub: false, dub: false }); return { sub: false, dub: false }; }
    var seriesData = await seriesRes.json();
    if (!seriesData.ok || !seriesData.data || !seriesData.data.episodes) { cacheScrape(cacheKey, { sub: false, dub: false }); return { sub: false, dub: false }; }

    var episodes = seriesData.data.episodes;
    var targetEp = null;
    for (var j = 0; j < episodes.length; j++) {
      if (Number(episodes[j].number) === Number(ep)) { targetEp = episodes[j]; break; }
    }
    if (!targetEp || !targetEp.embed_url) { cacheScrape(cacheKey, { sub: false, dub: false }); return { sub: false, dub: false }; }

    var result = { sub: !!targetEp.embed_url.sub, dub: !!targetEp.embed_url.dub };
    cacheScrape(cacheKey, result);
    return result;
  } catch (e) {
    cacheScrape(cacheKey, { sub: false, dub: false });
    return { sub: false, dub: false };
  }
}

function rewriteM3u8(body, baseUrl, serverHost, hParam) {
  var lines = body.split("\n");
  var baseDir = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
  var urlObj = null;
  try { urlObj = new URL(baseUrl); } catch {}
  var origin = urlObj ? urlObj.origin : "";
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith(serverHost)) continue;
    var absUrl;
    if (line.startsWith("http://") || line.startsWith("https://")) {
      absUrl = line;
    } else if (line.startsWith("/")) {
      absUrl = origin + line;
    } else {
      absUrl = baseDir + line;
    }
    lines[li] = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(absUrl) + hParam;
  }
  return lines.join("\n");
}

async function handleRequest(request) {
  var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  var reqUrl = new URL(request.url);
  var host = reqUrl.host || "localhost";
  var proto = reqUrl.protocol ? reqUrl.protocol.replace(":", "") : "https";
  if (proto === "http" && host.indexOf("localhost") === -1 && host.indexOf("127.") === -1) proto = "https";
  var serverHost = proto + "://" + host;
  var url = decodeURIComponent(reqUrl.pathname);

  try {
    var embedMatch = url.match(/^\/api\/anime-embed\/(\d+)\/episode\/(\d+)$/);
    if (embedMatch) {
      var anilistId = Number(embedMatch[1]);
      var episode = Number(embedMatch[2]);

      var aniInfoPromise2 = fetchAnilistInfo(anilistId);
      var aniInfo2 = await aniInfoPromise2;
      var malId2 = aniInfo2.malId;
      var animeTitle2 = aniInfo2.title;
      var result2 = { success: true, anilistId: anilistId, malId: malId2, ep: episode, title: animeTitle2, sources: [], downloads: null };

      var mpPromise2 = malId2 ? scrapeBoth(malId2, episode).catch(function() { return {}; }) : Promise.resolve({});
      var dlPromise2 = malId2 ? getDownloadLinksCached(malId2, episode) : Promise.resolve(null);

      var mpDlResults2 = await Promise.all([mpPromise2, dlPromise2]);
      result2.downloads = mpDlResults2[1];
      var sources2 = mpDlResults2[0];

      if (sources2 && typeof sources2 === "object") {
        var langKeys3 = ["sub", "dub"];
        for (var li3 = 0; li3 < langKeys3.length; li3++) {
          var lang3 = langKeys3[li3];
          if (sources2[lang3]) {
            var s3 = sources2[lang3];
            result2.sources.push({ source: "megaplay", type: lang3, m3u8: null, tracks: null, intro: s3.intro || null, outro: s3.outro || null, label: animeTitle2 + " " + lang3.toUpperCase() + " (MegaPlay)", embedUrl: "" });
          }
        }
      }

      var vmServers = ["neko", "koto", "miko", "dib", "wave", "senshi"];
      var vmLangs = ["sub", "dub"];
      var vmPromises = [];
      var vmKeys = [];
      for (var vmi = 0; vmi < vmServers.length; vmi++) {
        for (var vmj = 0; vmj < vmLangs.length; vmj++) {
          vmPromises.push(scrapeVaromine(anilistId, episode, vmLangs[vmj], vmServers[vmi]).then(function(d) { return d ? { available: true } : null; }).catch(function() { return null; }));
          vmKeys.push({ server: vmServers[vmi], lang: vmLangs[vmj] });
        }
      }
      var vmSettled = await Promise.allSettled(vmPromises);
      for (var vmk = 0; vmk < vmSettled.length; vmk++) {
        if (vmSettled[vmk].status === "fulfilled" && vmSettled[vmk].value) {
          result2.sources.push({ source: "anikage", server: vmKeys[vmk].server, type: vmKeys[vmk].lang, m3u8: null, tracks: null, intro: null, outro: null, label: animeTitle2 + " " + vmKeys[vmk].lang.toUpperCase() + " (" + vmKeys[vmk].server + ")", embedUrl: "" });
        }
      }

      return new Response(JSON.stringify(result2), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    var watchMatch = url.match(/^\/api\/watch-embed\/([-\w]+)$/);
    if (watchMatch) {
      var wHash = watchMatch[1];
      var wConfig = getConfig(wHash) || {};
      var mpH = "&headers=" + encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" }));
      wConfig.m3u8 = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wConfig.m3u8) + mpH;
      if (wConfig.tracks) { wConfig.tracks = wConfig.tracks.map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + mpH }); }); }
      var playerPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wConfig) + ";</script></head>");
      return new Response(playerPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    var akMatch = url.match(/^\/api\/ak\/embed\/([-\w]+)$/);
    if (akMatch) {
      var aHash = akMatch[1];
      var aConfig = getConfig(aHash) || {};
      var akReferer3 = "https://vivibebe.site/";
      if (aConfig.m3u8 && aConfig.m3u8.includes("megaplay")) akReferer3 = "https://megaplay.buzz/";
      else if (aConfig.m3u8 && aConfig.m3u8.includes("vidtube")) akReferer3 = "https://vidtube.site/";
      var VND_HEADERS3 = encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": akReferer3 }));
      aConfig.m3u8 = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(aConfig.m3u8) + "&headers=" + VND_HEADERS3;
      if (aConfig.tracks) { aConfig.tracks = aConfig.tracks.map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + VND_HEADERS3 }); }); }
      var playerPageA = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(aConfig) + ";</script></head>");
      return new Response(playerPageA, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    if (url === "/api/proxy/m3u8") {
      var targetUrl = reqUrl.searchParams.get("url");
      if (!targetUrl) return new Response("Missing url param", { status: 400 });
      var customHeaders = reqUrl.searchParams.get("headers");
      var isMegacloud = targetUrl.indexOf("megacloud.animanga.fun") > -1;
      var fetchHeaders = isMegacloud ? {} : Object.assign({}, CDN_HEADERS);
      if (customHeaders) {
        try { var parsed = JSON.parse(customHeaders); Object.assign(fetchHeaders, parsed); } catch {}
      }
      if (!fetchHeaders["User-Agent"]) fetchHeaders["User-Agent"] = UA;

      // Check proxy cache
      var pCacheKey = "p-" + targetUrl;
      var pCached = getScrapeCache(pCacheKey);
      if (pCached) return new Response(pCached.body, { status: 200, headers: Object.assign({}, corsHeaders, pCached.headers) });

      // Attempt fetch with retry
      var r = null;
      for (var pTry = 0; pTry < 2; pTry++) {
        try {
          r = await fetch(targetUrl, { headers: fetchHeaders, redirect: "follow" });
          if (r.ok || r.status < 500) break;
        } catch (e) { if (pTry === 1) throw e; }
        // Wait 1s before retry
        await new Promise(function(rs) { setTimeout(rs, 1000); });
        // Rotate User-Agent on retry
        fetchHeaders["User-Agent"] = UA.indexOf("Chrome/131") > -1 ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" : UA;
      }
      if (!r) return new Response("Fetch failed", { status: 502, headers: corsHeaders });

      var contentType = r.headers.get("content-type") || "";
      var isM3u8 = contentType.includes("mpegurl") || targetUrl.includes(".m3u8") || targetUrl.endsWith(".m3u8") || (contentType === "" && targetUrl.includes("m3u8"));

      if (!r.ok) {
        var err = await r.text();
        return new Response(err, { status: r.status, headers: Object.assign({}, corsHeaders, { "Content-Type": contentType || "text/plain" }) });
      }
      if (isM3u8) {
        var body = await r.text();
        var hParam = customHeaders ? "&headers=" + encodeURIComponent(customHeaders) : "";
        var rewritten = rewriteM3u8(body, targetUrl, serverHost, hParam);
        var respHeaders = { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "public, max-age=60" };
        Object.assign(respHeaders, corsHeaders);
        // Cache rewritten m3u8 for 60s
        cacheScrape(pCacheKey, { body: rewritten, headers: respHeaders });
        return new Response(rewritten, { status: 200, headers: respHeaders });
      } else {
        var buf = new Uint8Array(await r.arrayBuffer());
        var ct2 = contentType || "application/octet-stream";
        if (targetUrl.includes(".vtt") || targetUrl.includes("/subtitles/")) ct2 = "text/vtt; charset=utf-8";
        else if (targetUrl.includes(".ts")) ct2 = "video/mp2t";
        else if (targetUrl.includes(".m4s") || targetUrl.includes("/seg-") || targetUrl.includes("/chunk-")) ct2 = "video/mp4";
        var segHeaders = { "Content-Type": ct2, "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
        // Cache segments for 5 min
        cacheScrape(pCacheKey, { body: buf, headers: segHeaders });
        return new Response(buf, { status: 200, headers: segHeaders });
      }
    }

    if (url === "/api/health") {
      return new Response(JSON.stringify({ ok: true, time: Date.now() }), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    if (url === "/api/hls.js" || url === "/api/hls.min.js") {
      try {
        var hlsCode = null;
        try {
          if (typeof require === "function") {
            var fs = require("fs");
            var path = require("path");
            hlsCode = fs.readFileSync(path.join(__dirname, "hls.min.js"), "utf8");
          }
        } catch (e) {}
        if (!hlsCode) {
          try {
            var cdnResp = await fetch("https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js");
            if (cdnResp.ok) hlsCode = await cdnResp.text();
          } catch (e2) {}
        }
        if (!hlsCode) {
          hlsCode = '(function(){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";s.onload=function(){if(window.onHlsReady)window.onHlsReady()};document.head.appendChild(s)})()';
        }
        return new Response(hlsCode, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" }) });
      } catch (e) {
        var fallback = '(function(){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";document.head.appendChild(s)})()';
        return new Response(fallback, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/javascript; charset=utf-8" }) });
      }
    }

    var watchMegaMatch = url.match(/^\/api\/watch\/megaplay\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchMegaMatch) {
      var wAnilistId = Number(watchMegaMatch[1]);
      var wEpisode = Number(watchMegaMatch[2]);
      var wLang = watchMegaMatch[3];
      var wAnilistInfo = await fetchAnilistInfo(wAnilistId);
      var wTitle = wAnilistInfo.title;
      var wCacheKey = "mp-" + wAnilistId + "-" + wEpisode + "-" + wLang;
      var wData = getScrapeCache(wCacheKey);
      var wEmbedUrl = "";

      if (!wData) {
        try {
          var akEmbedUrl = await findAnikotoEmbedUrl(wAnilistId, wEpisode, wLang);
          if (akEmbedUrl) {
            wEmbedUrl = akEmbedUrl;
            var akPageRes = await fetch(akEmbedUrl, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
            if (akPageRes.ok) {
              var akHtml = await akPageRes.text();
              var akDataIdMatch = akHtml.match(/data-id="(\d+)"/);
              if (akDataIdMatch) {
                var akSrcRes = await fetch("https://megaplay.buzz/stream/getSources?id=" + akDataIdMatch[1], {
                  headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/", "X-Requested-With": "XMLHttpRequest" }
                });
                if (akSrcRes.ok) {
                  var akSrcData = await akSrcRes.json();
                  if (akSrcData && akSrcData.sources && akSrcData.sources.file) {
                    var akTracks = [];
                    if (akSrcData.tracks && akSrcData.tracks.length) {
                      akTracks = akSrcData.tracks.map(function(t) { return { file: t.file || "", label: t.label || "Unknown", kind: t.kind || "captions", default: t.default || false }; });
                    }
                    wData = { m3u8: akSrcData.sources.file, tracks: akTracks, intro: akSrcData.intro || null, outro: akSrcData.outro || null };
                    cacheScrape(wCacheKey, wData);
                  }
                }
              }
            }
          }
        } catch (e) { wData = null; }
      }

      if (!wData) {
        try {
          if (!wEmbedUrl) wEmbedUrl = "https://megaplay.buzz/stream/ani/" + wAnilistId + "/" + wEpisode + "/" + wLang;
          var mpRes = await fetch(wEmbedUrl, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
          if (mpRes.ok) {
            var mpHtml = await mpRes.text();
            var dataIdMatch = mpHtml.match(/data-id="(\d+)"/);
            if (dataIdMatch) {
              var mpSrcRes = await fetch("https://megaplay.buzz/stream/getSources?id=" + dataIdMatch[1], {
                headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/", "X-Requested-With": "XMLHttpRequest" }
              });
              if (mpSrcRes.ok) {
                var mpSrcData = await mpSrcRes.json();
                if (mpSrcData && mpSrcData.sources && mpSrcData.sources.file) {
                  var mpTracks = [];
                  if (mpSrcData.tracks && mpSrcData.tracks.length) {
                    mpTracks = mpSrcData.tracks.map(function(t) { return { file: t.file || "", label: t.label || "Unknown", kind: t.kind || "captions", default: t.default || false }; });
                  }
                  wData = { m3u8: mpSrcData.sources.file, tracks: mpTracks, intro: mpSrcData.intro || null, outro: mpSrcData.outro || null };
                  cacheScrape(wCacheKey, wData);
                }
              }
            }
          }
        } catch (e) { wData = null; }
      }

      if (!wData) {
        var notAvailPage = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:radial-gradient(ellipse at 50% 0%,#1a0505 0%,#060202 70%);font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#ffe6e8;display:flex;align-items:center;justify-content:center;overflow:hidden}.box{text-align:center;padding:40px;border:1px solid rgba(255,30,60,0.3);border-radius:16px;background:rgba(255,30,60,0.05);backdrop-filter:blur(10px);max-width:400px}.icon{width:60px;height:60px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#f72585);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(255,30,60,0.3)}.icon svg{width:28px;height:28px;fill:#fff}h2{font-size:18px;margin-bottom:8px;color:#ff6b35}p{font-size:13px;color:rgba(255,230,232,0.5);line-height:1.5}.tag{display:inline-block;margin-top:16px;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:1px;background:rgba(255,107,53,0.15);color:#ff6b35;border:1px solid rgba(255,107,53,0.3)}</style></head><body><div class="box"><div class="icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><h2>Not Available</h2><p>' + wLang.toUpperCase() + ' stream not available on<br><strong>MEGAPLAY</strong> for Episode ' + wEpisode + '</p><div class="tag">TRY ANOTHER SERVER</div></div></body></html>';
        return new Response(notAvailPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
      }
      var wCfg = { m3u8: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wData.m3u8) + "&headers=" + encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": "https://megaplay.buzz/" })), tracks: (wData.tracks || []).map(function(t) { return Object.assign({}, t, { file: t.file ? serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": "https://megaplay.buzz/" })) : "" }); }), intro: wData.intro || null, outro: wData.outro || null, title: wTitle + " - Ep " + wEpisode, embedUrl: wEmbedUrl || "https://megaplay.buzz/stream/ani/" + wAnilistId + "/" + wEpisode + "/" + wLang };
      var wPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg) + ";</script></head>");
      return new Response(wPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    function serveAnikageServer(aniId, ep, lang, serverName) {
      return async function() {
        var wAnilistInfo = await fetchAnilistInfo(aniId);
        var wTitle = wAnilistInfo.title;
        var wData = await scrapeVaromine(aniId, ep, lang, serverName);

        if (!wData) {
          var fallbackServer = serverName === "neko" ? "koto" : serverName === "koto" ? "neko" : "";
          if (fallbackServer) wData = await scrapeVaromine(aniId, ep, lang, fallbackServer);
          if (wData) serverName = fallbackServer;
        }

        if (!wData) {
          var notAvailPage = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:radial-gradient(ellipse at 50% 0%,#1a0505 0%,#060202 70%);font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#ffe6e8;display:flex;align-items:center;justify-content:center;overflow:hidden}.box{text-align:center;padding:40px;border:1px solid rgba(255,30,60,0.3);border-radius:16px;background:rgba(255,30,60,0.05);backdrop-filter:blur(10px);max-width:400px}.icon{width:60px;height:60px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#f72585);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(255,30,60,0.3)}.icon svg{width:28px;height:28px;fill:#fff}h2{font-size:18px;margin-bottom:8px;color:#ff6b35}p{font-size:13px;color:rgba(255,230,232,0.5);line-height:1.5}.tag{display:inline-block;margin-top:16px;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:1px;background:rgba(255,107,53,0.15);color:#ff6b35;border:1px solid rgba(255,107,53,0.3)}</style></head><body><div class="box"><div class="icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><h2>Not Available</h2><p>' + lang.toUpperCase() + ' stream not available on<br><strong>' + serverName.toUpperCase() + '</strong> for Episode ' + ep + '</p><div class="tag">TRY ANOTHER SERVER</div></div></body></html>';
          return new Response(notAvailPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
        }
        var streamReferer = "https://vivibebe.site/";
        if (wData.embedUrl && wData.embedUrl.includes("bibiemb")) streamReferer = "https://bibiemb.xyz/";
        else if (wData.embedUrl && wData.embedUrl.includes("otakuhg")) streamReferer = "https://otakuhg.site/";
        else if (wData.embedUrl && wData.embedUrl.includes("otakuvid")) streamReferer = "https://otakuvid.online/";
        else if (wData.embedUrl && wData.embedUrl.includes("megaplay")) streamReferer = "https://megaplay.buzz/";
        else if (wData.embedUrl && wData.embedUrl.includes("vidtube")) streamReferer = "https://vidtube.site/";
        else if (wData.embedUrl && wData.embedUrl.includes("vidwish")) streamReferer = "https://vidwish.live/";
        else if (wData.embedUrl && wData.embedUrl.includes("ninstream")) streamReferer = "https://ninstream.com/";
        else if (wData.embedUrl && wData.embedUrl.includes("playeng")) streamReferer = "https://playeng.animeapps.top/";
        else if (wData.embedUrl && wData.embedUrl.includes("echovideo")) streamReferer = "https://play.echovideo.ru/";
        else if (wData.embedUrl && wData.embedUrl.includes("myvidplay")) streamReferer = "https://myvidplay.com/";
        var AK_HDRS = encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": streamReferer }));
        var wCfg = { m3u8: wData.m3u8 ? serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wData.m3u8) + "&headers=" + AK_HDRS : "", tracks: (wData.tracks || []).map(function(t) { return Object.assign({}, t, { file: t.file ? serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + AK_HDRS : "" }); }), intro: wData.intro || null, outro: wData.outro || null, title: wTitle + " - Ep " + ep, embedUrl: wData.embedUrl || "", allSources: wData.allSources || [], allEmbeds: wData.allEmbeds || [] };
        var wPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg) + ";</script></head>");
        return new Response(wPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
      };
    }

    var watchNekoMatch = url.match(/^\/api\/watch\/neko\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchNekoMatch) return await serveAnikageServer(Number(watchNekoMatch[1]), Number(watchNekoMatch[2]), watchNekoMatch[3], "neko")();

    var watchKotoMatch = url.match(/^\/api\/watch\/koto\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchKotoMatch) return await serveAnikageServer(Number(watchKotoMatch[1]), Number(watchKotoMatch[2]), watchKotoMatch[3], "koto")();

    var watchMikoMatch = url.match(/^\/api\/watch\/miko\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchMikoMatch) return await serveAnikageServer(Number(watchMikoMatch[1]), Number(watchMikoMatch[2]), watchMikoMatch[3], "miko")();

    var watchDibMatch = url.match(/^\/api\/watch\/dib\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchDibMatch) return await serveAnikageServer(Number(watchDibMatch[1]), Number(watchDibMatch[2]), watchDibMatch[3], "dib")();

    var watchWaveMatch = url.match(/^\/api\/watch\/wave\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchWaveMatch) return await serveAnikageServer(Number(watchWaveMatch[1]), Number(watchWaveMatch[2]), watchWaveMatch[3], "wave")();

    var watchSenshiMatch = url.match(/^\/api\/watch\/senshi\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchSenshiMatch) return await serveAnikageServer(Number(watchSenshiMatch[1]), Number(watchSenshiMatch[2]), watchSenshiMatch[3], "senshi")();

    var watchAkMatch = url.match(/^\/api\/watch\/ak\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchAkMatch) {
      var wAnilistId2 = Number(watchAkMatch[1]);
      var wEpisode2 = Number(watchAkMatch[2]);
      var wLang2 = watchAkMatch[3];
      var wAkData = null, wServerName2 = "";
      var wServers2 = ["neko", "koto"];
      for (var si2 = 0; si2 < wServers2.length; si2++) {
        var srvData = await scrapeVaromine(wAnilistId2, wEpisode2, wLang2, wServers2[si2]);
        if (srvData) { wAkData = srvData; wServerName2 = wServers2[si2]; break; }
      }
      if (!wAkData) return new Response(wLang2.toUpperCase() + " not available for ep " + wEpisode2, { status: 404, headers: corsHeaders });
      var wAnilistInfo2 = await fetchAnilistInfo(wAnilistId2);
      var wTitle2 = wAnilistInfo2.title;
      var akReferer2 = "https://vivibebe.site/";
      if (wAkData.embedUrl && wAkData.embedUrl.includes("megaplay")) akReferer2 = "https://megaplay.buzz/";
      else if (wAkData.embedUrl && wAkData.embedUrl.includes("vidtube")) akReferer2 = "https://vidtube.site/";
      else if (wAkData.embedUrl && wAkData.embedUrl.includes("vidwish")) akReferer2 = "https://vidwish.live/";
      var AK_HDRS2 = encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": akReferer2 }));
      var wCfg2 = { m3u8: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wAkData.m3u8) + "&headers=" + AK_HDRS2, tracks: (wAkData.tracks || []).map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + AK_HDRS2 }); }), intro: wAkData.intro || null, outro: wAkData.outro || null, title: wTitle2 + " - Ep " + wEpisode2, embedUrl: wAkData.embedUrl || "" };
      var wPage2 = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg2) + ";</script></head>");
      return new Response(wPage2, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    var availMatch = url.match(/^\/api\/availability\/(\d+)\/(\d+)$/);
    if (availMatch) {
      var avAnilistId = Number(availMatch[1]);
      var avEpisode = Number(availMatch[2]);

      var avServers = ["neko", "koto", "miko", "dib", "wave", "senshi"];
      var avLangs = ["sub", "dub"];
      var avPromises = [];
      var avKeys = [];
      for (var avi = 0; avi < avServers.length; avi++) {
        for (var avj = 0; avj < avLangs.length; avj++) {
          (function(srv, lang) {
            var apiUrl = ANIKAGE_API_BASE + "/" + avAnilistId + "/episodes/" + avEpisode + "/sources?provider=" + srv + "&lang=" + lang;
            avPromises.push(fetch(apiUrl, { headers: ANIKAGE_HEADERS }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { return !!(d && d.embeds && d.embeds.length > 0); }).catch(function() { return false; }));
          })(avServers[avi], avLangs[avj]);
          avKeys.push({ server: avServers[avi], lang: avLangs[avj] });
        }
      }

      var avResults = { neko: { sub: false, dub: false }, koto: { sub: false, dub: false }, miko: { sub: false, dub: false }, dib: { sub: false, dub: false }, wave: { sub: false, dub: false }, senshi: { sub: false, dub: false }, megaplay: { sub: false, dub: false } };
      var avSettled = await Promise.allSettled(avPromises);
      for (var avk = 0; avk < avSettled.length; avk++) {
        if (avSettled[avk].status === "fulfilled" && avSettled[avk].value) {
          avResults[avKeys[avk].server][avKeys[avk].lang] = true;
        }
      }

      var avAnilistInfo = await fetchAnilistInfo(avAnilistId);
      var avMalId = avAnilistInfo.malId;

      try {
        var avAkResult = await checkAnikotoAvailability(avAnilistId, avEpisode);
        if (avAkResult.sub) { avResults.megaplay.sub = true; }
        if (avAkResult.dub) { avResults.megaplay.dub = true; }
      } catch (e) {}

      if (!avResults.megaplay.sub || !avResults.megaplay.dub) {
        try {
          var avMpUrl = "https://megaplay.buzz/stream/ani/" + avAnilistId + "/" + avEpisode + "/sub";
          var avMpRes = await fetch(avMpUrl, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
          if (avMpRes.ok) {
            var avMpHtml = await avMpRes.text();
            if (avMpHtml.match(/data-id="\d+"/)) { avResults.megaplay.sub = true; }
          }
        } catch (e) {}
        try {
          var avMpUrlDub = "https://megaplay.buzz/stream/ani/" + avAnilistId + "/" + avEpisode + "/dub";
          var avMpResDub = await fetch(avMpUrlDub, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
          if (avMpResDub.ok) {
            var avMpHtmlDub = await avMpResDub.text();
            if (avMpHtmlDub.match(/data-id="\d+"/)) { avResults.megaplay.dub = true; }
          }
        } catch (e) {}
      }

      return new Response(JSON.stringify(avResults), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    var embedsMatch = url.match(/^\/api\/embeds\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (embedsMatch) {
      var emAnilistId = Number(embedsMatch[1]);
      var emEpisode = Number(embedsMatch[2]);
      var emLang = embedsMatch[3];
      var emProviders = ["neko", "koto"];
      var emResults = { neko: null, koto: null };
      var emPromises = emProviders.map(function(p) {
        return scrapeVaromine(emAnilistId, emEpisode, emLang, p).then(function(d) {
          return d ? { server: p, m3u8: d.m3u8, embedUrl: d.embedUrl, allEmbeds: d.allEmbeds } : null;
        }).catch(function() { return null; });
      });
      var emSettled = await Promise.allSettled(emPromises);
      for (var emi = 0; emi < emSettled.length; emi++) {
        if (emSettled[emi].status === "fulfilled" && emSettled[emi].value) {
          emResults[emSettled[emi].value.server] = emSettled[emi].value;
        }
      }
      return new Response(JSON.stringify(emResults), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    var dubCountMatch = url.match(/^\/api\/dubcount\/(\d+)$/);
    if (dubCountMatch) {
      var dcAnilistId = Number(dubCountMatch[1]);
      var dcInfo = await fetchAnilistInfo(dcAnilistId);
      var dcTotalEps = dcInfo.totalEpisodes || 100;
      if (dcTotalEps > 300) dcTotalEps = 300;
      var dcSample = [];
      var dcStep = Math.max(1, Math.floor(dcTotalEps / 20));
      for (var dcI = 1; dcI <= dcTotalEps; dcI += dcStep) dcSample.push(dcI);
      if (!dcSample.includes(1)) dcSample.unshift(1);
      if (!dcSample.includes(dcTotalEps)) dcSample.push(dcTotalEps);
      var dcResults = await Promise.allSettled(dcSample.map(function(ep) {
        return scrapeVaromine(dcAnilistId, ep, "dub", "neko").then(function(d) { return { ep: ep, dub: !!d }; }).catch(function() { return { ep: ep, dub: false }; });
      }));
      var dcDubEps = [];
      var dcNoDubEps = [];
      for (var dcR = 0; dcR < dcResults.length; dcR++) {
        if (dcResults[dcR].status === "fulfilled") {
          if (dcResults[dcR].value.dub) dcDubEps.push(dcResults[dcR].value.ep);
          else dcNoDubEps.push(dcResults[dcR].value.ep);
        }
      }
      var dcEstimate = dcTotalEps;
      if (dcNoDubEps.length > 0 && dcDubEps.length > 0) {
        var dcLastDub = Math.max.apply(null, dcDubEps);
        dcEstimate = dcLastDub;
      } else if (dcDubEps.length === 0) {
        dcEstimate = 0;
      }
      return new Response(JSON.stringify({ anilistId: dcAnilistId, totalEpisodes: dcTotalEps, dubbedEpisodes: dcEstimate, sampleChecked: dcSample.length, sampleWithDub: dcDubEps.length, sampleWithoutDub: dcNoDubEps.length }), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    var dlMatch = url.match(/^\/api\/download\/(\d+)\/episode\/(\d+)$/);
    if (dlMatch) {
      var dlAnilistId = Number(dlMatch[1]);
      var dlEpisode = Number(dlMatch[2]);

      var dlAnilistPromise = fetchAnilistInfo(dlAnilistId);
      var dlInfoPromise = fetch(ANIKAGE_API_BASE + "/" + dlAnilistId, { headers: ANIKAGE_HEADERS }).then(function(r) { return r.json(); }).catch(function() { return null; });
      var dlEpsPromise = fetch(ANIKAGE_API_BASE + "/" + dlAnilistId + "/episodes", { headers: ANIKAGE_HEADERS }).then(function(r) { return r.json(); }).catch(function() { return null; });

      var [dlAnilistInfo, dlInfoRes, dlEpsRes] = await Promise.all([dlAnilistPromise, dlInfoPromise, dlEpsPromise]);

      var dlTitle = dlAnilistInfo.title || "";
      var dlCover = "";
      var dlMalId = dlAnilistInfo.malId || null;

      var dlInfo = dlInfoRes && dlInfoRes.anime ? dlInfoRes.anime : (dlInfoRes && dlInfoRes.data ? dlInfoRes.data : {});
      if (!dlTitle && dlInfo.title) dlTitle = dlInfo.title.english || dlInfo.title.romaji || dlInfo.title.userPreferred || dlInfo.title || "";
      if (dlInfo.coverImage) dlCover = dlInfo.coverImage.extraLarge || dlInfo.coverImage.large || dlInfo.coverImage.medium || dlInfo.coverImage || "";
      if (!dlCover && dlInfo.images && dlInfo.images.jpg) dlCover = dlInfo.images.jpg.large_image_url || dlInfo.images.jpg.image_url || "";

      var dlDlData = dlMalId ? await getDownloadLinksCached(dlMalId, dlEpisode) : null;

      var dlEpList = dlEpsRes && Array.isArray(dlEpsRes) ? dlEpsRes : (dlEpsRes && dlEpsRes.data ? (Array.isArray(dlEpsRes.data) ? dlEpsRes.data : []) : []);
      var dlTotalEps = dlInfo.totalEpisodes || dlInfo.total_episodes || dlEpList.length || 24;
      var dlGenres = dlInfo.genres || [];
      var dlRating = dlInfo.rating || dlInfo.score || "";
      var dlSubLinks = dlDlData && dlDlData.sub ? dlDlData.sub : [];
      var dlDubLinks = dlDlData && dlDlData.dub ? dlDlData.dub : [];

      var dlCurrentEp = dlInfo.currentEpisode || dlInfo.total_episodes || dlEpList.length || dlEpisode;
      var dlAiredEps = Math.max(dlCurrentEp, dlEpisode);
      if (dlTotalEps > 0 && dlAiredEps > dlTotalEps) dlAiredEps = dlTotalEps;

      var epScrollHtml = "";
      var epStart = Math.max(1, dlEpisode - 4);
      var epEnd = Math.min(dlAiredEps, dlEpisode + 7);
      for (var ei = epStart; ei <= epEnd; ei++) {
        var isActive = ei === dlEpisode ? " active" : "";
        epScrollHtml += '<a class="ep-chip' + isActive + '" href="/api/download/' + dlAnilistId + '/episode/' + ei + '">' + String(ei).padStart(2, "0") + "</a>";
      }

      var downloadLinksHtml = "";
      if (dlSubLinks.length > 0) {
        downloadLinksHtml += '<div class="dl-section"><div class="dl-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-5"/></svg> Sub (English)</div><div class="dl-links">';
        dlSubLinks.forEach(function(link) {
          var workerUrl = link.workerUrls && link.workerUrls[0] ? link.workerUrls[0] : link.url;
          downloadLinksHtml += '<a class="dl-link" href="' + workerUrl + '" target="_blank" rel="noopener"><span class="dl-quality">' + (link.quality || "Default") + '</span><span class="dl-server">Download</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>';
        });
        downloadLinksHtml += "</div></div>";
      }
      if (dlDubLinks.length > 0) {
        downloadLinksHtml += '<div class="dl-section"><div class="dl-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-5"/></svg> Dub</div><div class="dl-links">';
        dlDubLinks.forEach(function(link) {
          var workerUrl = link.workerUrls && link.workerUrls[0] ? link.workerUrls[0] : link.url;
          downloadLinksHtml += '<a class="dl-link" href="' + workerUrl + '" target="_blank" rel="noopener"><span class="dl-quality">' + (link.quality || "Default") + '</span><span class="dl-server">Download</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>';
        });
        downloadLinksHtml += "</div></div>";
      }
      if (!downloadLinksHtml) downloadLinksHtml = '<div class="no-links">No download links available for this episode.</div>';

      var genresPills = dlGenres.map(function(g) { return '<span class="pill">' + g.toLowerCase() + "</span>"; }).join("");
      var ratingPill = dlRating ? '<span class="pill hot">\u2605 ' + (typeof dlRating === "number" ? dlRating.toFixed(1) : dlRating) + " rating</span>" : "";
      var watchUrl = "https://animezilla.pages.dev/pages/watch/" + (dlInfo.slug || dlAnilistId) + "--" + dlAnilistId + "-al/" + dlEpisode + "?lang=sub";

      var dlPage = DOWNLOAD_PAGE_HTML.replace(/\{\{TITLE\}\}/g, dlTitle)
        .replace(/\{\{COVER\}\}/g, dlCover)
        .replace(/\{\{EPISODE\}\}/g, String(dlEpisode).padStart(2, "0"))
        .replace(/\{\{TOTAL_EPS\}\}/g, dlAiredEps)
        .replace(/\{\{EP_SCROLL\}\}/g, epScrollHtml)
        .replace(/\{\{RATING_PILL\}\}/g, ratingPill)
        .replace(/\{\{GENRES_PILLS\}\}/g, genresPills)
        .replace(/\{\{DOWNLOAD_LINKS\}\}/g, downloadLinksHtml)
        .replace(/\{\{WATCH_URL\}\}/g, watchUrl)
        .replace(/\{\{DESCRIPTION\}\}/g, dlInfo.description || "")
        .replace(/\{\{RATING\}\}/g, dlRating ? (typeof dlRating === "number" ? dlRating.toFixed(1) : dlRating) : "N/A")
        .replace(/\{\{FORMAT\}\}/g, dlInfo.format || "TV");

      return new Response(dlPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message, stack: e.stack }), { status: 500, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || "Internal error", stack: e.stack }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
  }
};