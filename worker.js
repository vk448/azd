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
const MEGAPLAY_PROXY = "https://megaplay-proxy.ak6339575.workers.dev"; // Second account proxy
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

  var validServers = ["neko", "koto", "miko", "dib", "wave", "senshi"];
  var provider = serverName && validServers.indexOf(serverName) > -1 ? serverName : "neko";
  var apiUrl = ANIKAGE_API_BASE + "/" + anilistId + "/episodes/" + episode + "/sources?provider=" + provider + "&lang=" + (lang || "sub");

  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var r = await fetch(apiUrl, { headers: ANIKAGE_HEADERS, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { if (attempt < 1) continue; return null; }
      var data = await r.json();
      if (!data || !data.embeds || data.embeds.length === 0) { if (attempt < 1) continue; return null; }

    var embeds = data.embeds || [];
    var subtitles = data.subtitles || [];
    var sources = data.sources || [];
    var m3u8Url = null;
    var usedEmbed = null;
    var embedTracks = [];

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
        if (scraped.m3u8) {
          m3u8Url = scraped.m3u8;
          usedEmbed = eUrl;
        }
        if (scraped.tracks && scraped.tracks.length) {
          embedTracks = scraped.tracks;
        }
        if (m3u8Url) break;
      }
    }

    if (!m3u8Url) { if (attempt < 1) continue; return null; }

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
    // Merge tracks from embed page scraping
    for (var eti = 0; eti < embedTracks.length; eti++) {
      if (!tracks.some(function(t) { return t.file === embedTracks[eti].file; })) {
        tracks.push(Object.assign({}, embedTracks[eti], { default: false }));
      }
    }

    // Merge SUB subtitles into DUB
    if (lang === "dub" && tracks.length <= 1) {
      try {
        var subCacheKey = "se-" + anilistId + "-" + episode + "-sub-" + (serverName || "default");
        var subCached = getScrapeCache(subCacheKey);
        var subTracksToAdd = [];
        if (subCached && subCached.tracks) {
          subTracksToAdd = subCached.tracks;
        } else {
          var subApiUrl = ANIKAGE_API_BASE + "/" + anilistId + "/episodes/" + episode + "/sources?provider=" + provider + "&lang=sub";
          var subR = await fetch(subApiUrl, { headers: ANIKAGE_HEADERS, signal: AbortSignal.timeout(15000) });
          if (subR.ok) {
            var subData = await subR.json();
            if (subData && subData.sources) {
              for (var sti = 0; sti < subData.sources.length; sti++) {
                if (subData.sources[sti].embedUrl) {
                  var sm = subData.sources[sti].embedUrl.match(/[?&]sub=([^&]+)/);
                  if (sm) {
                    var su = decodeURIComponent(sm[1]);
                    if (su && su.startsWith("http")) subTracksToAdd.push({ file: su, label: (subData.subtitles && subData.subtitles[0] && subData.subtitles[0].label) || "English", kind: "captions", default: false });
                  }
                }
              }
            }
          }
        }
        for (var mti = 0; mti < subTracksToAdd.length; mti++) {
          if (!tracks.some(function(t) { return t.file === subTracksToAdd[mti].file; })) {
            tracks.push(Object.assign({}, subTracksToAdd[mti], { default: false }));
          }
        }
      } catch (e) {}
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
      if (attempt < 1) continue; return null;
    }
  }
  return null;
}

const scrapeVaromine = scrapeEmbeds;

async function scrapeM3u8FromEmbed(embedUrl) {
  try {
    var origin = new URL(embedUrl).origin;
    var r = await fetch(embedUrl, {
      headers: { "User-Agent": UA, "Referer": origin + "/" },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return null;
    var html = await r.text();
    var result = { m3u8: null, tracks: [] };

    var m3u8Regex = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g;
    var matches = html.match(m3u8Regex);
    if (matches && matches.length > 0) {
      var filtered = matches.filter(function(u) { return u.indexOf("prox.anikage.cc") === -1 && u.indexOf("prox.anicore.tv") === -1; });
      if (filtered.length > 0) result.m3u8 = filtered[0];
    }

    if (!result.m3u8) {
      var srcRegex = /src\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/g;
      var srcMatch;
      while ((srcMatch = srcRegex.exec(html)) !== null) {
        var srcUrl = srcMatch[1];
        if (srcUrl.indexOf("prox.anikage.cc") === -1 && srcUrl.indexOf("prox.anicore.tv") === -1) { result.m3u8 = srcUrl; break; }
      }
    }

    if (!result.m3u8) {
      var dataIdMatch = html.match(/data-id="([^"]+)"/);
      if (dataIdMatch) {
        var srcUrl2 = origin + "/stream/getSources?id=" + dataIdMatch[1];
        try {
          var r2 = await fetch(srcUrl2, {
            headers: { "User-Agent": UA, "Referer": embedUrl, "X-Requested-With": "XMLHttpRequest" },
            signal: AbortSignal.timeout(15000)
          });
          if (r2.ok) {
            var srcData = await r2.json();
            if (srcData && srcData.sources) {
              var srcFile = srcData.sources.file || srcData.sources[0] && srcData.sources[0].file;
              if (srcFile && srcFile.indexOf("prox.anikage.cc") === -1 && srcFile.indexOf("prox.anicore.tv") === -1) result.m3u8 = srcFile;
            }
            if (srcData && srcData.tracks && srcData.tracks.length) {
              for (var ti = 0; ti < srcData.tracks.length; ti++) {
                var trk = srcData.tracks[ti];
                if (trk.file && trk.file.startsWith("http")) {
                  result.tracks.push({ file: trk.file, label: trk.label || "English", kind: trk.kind || "captions", default: trk.default || false });
                }
              }
            }
          }
        } catch (e2) {}
      }
    }

    if (!result.m3u8) {
      var configMatch = html.match(/file\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/);
      if (configMatch && configMatch[1].indexOf("prox.anikage.cc") === -1) result.m3u8 = configMatch[1];
    }

    if (!result.m3u8) {
      var playerMatch = html.match(/player\s*\(\s*\{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)/);
      if (playerMatch && playerMatch[1].indexOf("prox.anikage.cc") === -1) result.m3u8 = playerMatch[1];
    }

    // Extract VTT subtitle URLs from embed page
    var vttRegex = /https?:\/\/[^\s"'<>]+\.vtt[^\s"'<>]*/g;
    var vttMatches = html.match(vttRegex);
    if (vttMatches && vttMatches.length > 0) {
      for (var vi = 0; vi < vttMatches.length; vi++) {
        var vUrl = vttMatches[vi].replace(/\\u002F/g, '/');
        if (!result.tracks.some(function(t) { return t.file === vUrl; })) {
          result.tracks.push({ file: vUrl, label: "English", kind: "captions", default: result.tracks.length === 0 });
        }
      }
    }

    // Also extract subtitle URLs from file:"..." patterns
    var subFileRegex = /file\s*[:=]\s*["'](https?:\/\/[^\s"'<>]+\.vtt[^"']*)/g;
    var subFileMatch;
    while ((subFileMatch = subFileRegex.exec(html)) !== null) {
      var sUrl = subFileMatch[1];
      if (!result.tracks.some(function(t) { return t.file === sUrl; })) {
        result.tracks.push({ file: sUrl, label: "English", kind: "captions", default: result.tracks.length === 0 });
      }
    }

    if (!result.m3u8) return null;
    return result;
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
  if (site === "megaplay") {
    var proxyUrl = MEGAPLAY_PROXY + "/?url=" + encodeURIComponent(base + "/stream/getSourcesNew?id=" + embedId) + "&headers=" + encodeURIComponent(JSON.stringify({ "X-Requested-With": "XMLHttpRequest" }));
    var r = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("getSources proxy " + embedId + ": " + r.status);
    var d = await r.json();
    if (d.error) throw new Error(d.message || d.error);
    return d;
  }
  var r = await fetch(base + "/stream/getSources?id=" + embedId, {
    headers: { "User-Agent": UA, "Referer": base + "/", "X-Requested-With": "XMLHttpRequest" }
  });
  if (!r.ok) throw new Error("getSources " + embedId + ": " + r.status);
  var d = await r.json();
  if (d.error) throw new Error(d.message || d.error);
  return d;
}

async function proxyFetch(targetUrl, extraHeaders) {
  var h = extraHeaders ? encodeURIComponent(JSON.stringify(extraHeaders)) : "";
  var proxyUrl = MEGAPLAY_PROXY + "/?url=" + encodeURIComponent(targetUrl) + (h ? "&headers=" + h : "");
  var r = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
  return r;
}

async function scrapeMegaplay(malId, episode) {
  var output = {};
  var base = { mal_id: String(malId), episode: episode };
  var results = await Promise.allSettled(["sub", "dub"].map(async function(lang) {
    var url = MEGAPLAY_BASE + "/stream/mal/" + malId + "/" + episode + "/" + lang;
    var r = await proxyFetch(url);
    if (!r.ok) throw new Error("embed page " + r.status);
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

  var results = await Promise.allSettled([scrapeNekoStream(malId, episode), scrapeMegaplay(malId, episode)]);
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="/api/hls.js"></script>
<style>
  :root{
    --stage:#07080A;
    --panel: rgba(20,18,24,0.55);
    --panel-strong: rgba(14,12,18,0.85);
    --glass-border: rgba(255,255,255,0.10);
    --ivory:#F3F1EC;
    --ivory-dim: rgba(243,241,236,0.6);
    --amber:#F5A93F;
    --amber2:#FF6F5E;
    --amber-dim: rgba(245,169,63,0.35);
    --track-bg: rgba(255,255,255,0.14);
    --radius: 10px;
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; background:#000; height:100%; overflow:hidden; }
  body{ font-family:'Inter', system-ui, sans-serif; }

  .player{
    position:fixed; inset:0;
    width:100vw; height:100vh;
    background:radial-gradient(120% 140% at 50% 0%, #14121a 0%, var(--stage) 60%);
    border-radius:0;
    box-shadow:none;
    overflow:hidden; user-select:none; outline:none;
  }
  .player video{
    width:100%; height:100%; display:block; background:#000; object-fit:contain;
  }
  .player:fullscreen, .player:-webkit-full-screen{
    width:100%; height:100%; border-radius:0;
  }

  .top-bar{
    position:absolute; top:20px; left:20px; right:20px;
    display:flex; align-items:flex-start; justify-content:space-between;
    z-index:5; transition: opacity .35s ease, transform .35s ease;
  }
  .title-block{
    max-width:min(70%, 520px);
    background:var(--panel);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    border:1px solid var(--glass-border);
    border-radius:13px; padding:10px 16px;
  }
  .title-block .kicker{
    font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
    background: linear-gradient(90deg, var(--amber), var(--amber2));
    -webkit-background-clip:text; background-clip:text; color:transparent;
    margin:0 0 3px; font-weight:700;
  }
  .title-block h1{
    font-family:'Space Grotesk', sans-serif;
    font-size:16.5px; font-weight:600; color:var(--ivory);
    margin:0; line-height:1.3;
  }

  .icon-btn{
    background:var(--panel);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border:1px solid var(--glass-border);
    color:var(--ivory); width:36px; height:36px; border-radius:11px;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition: background .2s ease, transform .15s ease, border-color .2s ease;
  }
  .icon-btn:hover{ background: var(--panel-strong); border-color: var(--amber-dim); }
  .icon-btn:active{ transform: scale(.93); }
  .icon-btn svg{ width:17px; height:17px; }

  .skip-pill{
    position:absolute; right:22px; bottom:92px;
    background: var(--panel-strong);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border:1px solid var(--amber-dim); color:var(--ivory);
    font-family:'Inter', sans-serif; font-size:13px; font-weight:500;
    padding:10px 16px; border-radius:11px;
    display:flex; align-items:center; gap:8px;
    cursor:pointer; z-index:6;
    opacity:0; transform:translateY(6px); pointer-events:none;
    transition: opacity .25s ease, transform .25s ease, border-color .2s ease;
  }
  .skip-pill.show{ opacity:1; transform:translateY(0); pointer-events:auto; }
  .skip-pill:hover{ border-color: var(--amber); }
  .skip-pill svg{ width:14px; height:14px; stroke:var(--amber); }

  .seek-flash{
    position:absolute; top:50%; transform:translateY(-50%);
    display:flex; flex-direction:column; align-items:center; gap:4px;
    color:var(--ivory); font-size:12px; font-weight:600;
    background:rgba(0,0,0,.55); border-radius:50%;
    width:64px; height:64px; justify-content:center;
    opacity:0; z-index:7; pointer-events:none;
    transition: opacity .3s ease;
  }
  .seek-flash.left{ left:14%; }
  .seek-flash.right{ right:14%; }
  .seek-flash.active{ opacity:1; }

  .center-transport{
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center; gap:34px;
    z-index:4; transition: opacity .35s ease;
  }
  .transport-btn{
    background:var(--panel);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border:1px solid var(--glass-border); color:var(--ivory);
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition: background .2s ease, transform .15s ease, border-color .2s ease;
  }
  .transport-btn:hover{ border-color: var(--amber-dim); }
  .transport-btn:active{ transform:scale(.9); }
  .transport-btn.seek{ width:48px; height:48px; }
  .transport-btn.seek svg{ width:22px; height:22px; }
  .transport-btn.play{
    position:relative; width:72px; height:72px;
    background: linear-gradient(135deg, var(--amber), var(--amber2));
    border:none; color:#1a0f00;
    box-shadow: 0 8px 28px -6px rgba(245,110,80,.6), 0 0 0 1px rgba(255,255,255,.08) inset;
  }
  .transport-btn.play:hover{ filter:brightness(1.06); transform:scale(1.05); }
  .transport-btn.play svg{ width:27px; height:27px; }
  .transport-btn.play::after{
    content:''; position:absolute; inset:-10px;
    border-radius:50%; border:1.5px solid var(--amber-dim); opacity:0;
  }
  .player.is-paused .transport-btn.play::after{
    opacity:1; animation: pulse-ring 2s ease-out infinite;
  }
  @keyframes pulse-ring{
    0%{ transform:scale(.9); opacity:.7; }
    100%{ transform:scale(1.35); opacity:0; }
  }

  .spinner{
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    width:38px; height:38px; z-index:6;
    border:3px solid rgba(255,255,255,.18);
    border-top-color: var(--amber); border-radius:50%;
    display:none; animation: spin .8s linear infinite;
  }
  .spinner.show{ display:block; }
  @keyframes spin{ to{ transform:translate(-50%,-50%) rotate(360deg); } }

  .bottom-bar{
    position:absolute; left:14px; right:14px; bottom:14px;
    padding:10px 14px 12px; z-index:5;
    background: var(--panel);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    border:1px solid var(--glass-border); border-radius:16px;
    transition: opacity .35s ease, transform .35s ease;
  }

  .progress-row{ display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .time{ font-family:'Space Grotesk',sans-serif; font-size:12px; color:var(--ivory-dim); min-width:42px; text-align:center; }

  .scrub-track{
    position:relative; flex:1; height:16px;
    display:flex; align-items:center; cursor:pointer;
  }
  .scrub-track .rail{ position:absolute; left:0; right:0; height:3px; border-radius:2px; background:var(--track-bg); }
  .scrub-track .buffered{ position:absolute; height:3px; border-radius:2px; background:rgba(255,255,255,0.32); width:0%; }
  .scrub-track .played{ position:absolute; height:3px; border-radius:2px; background:var(--amber); width:0%; }
  .scrub-track .knob{
    position:absolute; top:50%; transform:translate(-50%,-50%);
    width:13px; height:13px; border-radius:50%; background:var(--amber);
    box-shadow:0 0 0 3px rgba(242,169,59,.22); left:0%;
    transition: box-shadow .15s ease;
  }
  .scrub-track:hover .knob{ box-shadow:0 0 0 5px rgba(242,169,59,.3); }

  .controls-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .controls-left,.controls-right{ display:flex; align-items:center; gap:6px; }
  .flat-btn{
    background:transparent; border:none; color:var(--ivory);
    width:32px; height:32px; border-radius:7px;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
  }
  .flat-btn:hover{ background:rgba(255,255,255,.1); }
  .flat-btn svg{ width:18px; height:18px; }
  .flat-btn.active-toggle{ color:var(--amber); }

  .vol-wrap{ display:flex; align-items:center; gap:6px; }
  .vol-wrap input[type=range]{
    width:0; opacity:0; transition: width .2s ease, opacity .2s ease;
  }
  .vol-wrap:hover input[type=range],.vol-wrap.pinned input[type=range]{
    width:70px; opacity:1;
  }
  input[type=range]{
    -webkit-appearance:none; appearance:none;
    height:3px; background:var(--track-bg); border-radius:2px; outline:none;
  }
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none; width:11px; height:11px; border-radius:50%;
    background:var(--amber); cursor:pointer;
  }

  .time-display{
    font-size:12px; color:var(--ivory-dim);
    font-family:'Space Grotesk',sans-serif; margin-left:4px; white-space:nowrap;
  }

  .menu-wrap{ position:relative; }
  .menu{
    position:absolute; bottom:40px; right:0;
    background:var(--panel-strong);
    border:1px solid var(--glass-border); border-radius:10px;
    min-width:190px; padding:6px; display:none; z-index:9;
    box-shadow:0 12px 28px rgba(0,0,0,.45);
  }
  .menu.show{ display:block; }
  .menu-section + .menu-section{ border-top:1px solid var(--glass-border); margin-top:6px; padding-top:6px; }
  .menu-heading{
    font-size:10.5px; letter-spacing:.08em; text-transform:uppercase;
    color:#7c7e83; padding:6px 8px 4px;
  }
  .menu-item{
    display:flex; align-items:center; justify-content:space-between;
    padding:7px 8px; border-radius:6px; cursor:pointer;
    font-size:13px; color:var(--ivory);
  }
  .menu-item:hover{ background:rgba(255,255,255,.08); }
  .menu-item .check{ color:var(--amber); font-size:12px; opacity:0; }
  .menu-item.selected .check{ opacity:1; }
  .menu-item .badge{ font-size:10.5px; color:#7c7e83; }

  .hide{ opacity:0; pointer-events:none; }
  .player.hide-cursor{ cursor:none; }

  .subtitle-overlay{
    position:absolute; left:0; right:0; bottom:104px;
    display:flex; justify-content:center; z-index:5;
    pointer-events:none; padding:0 24px;
    transition: bottom .35s ease;
  }
  .subtitle-overlay.controls-hidden{ bottom:26px; }
  .subtitle-overlay .cue{
    background:rgba(6,6,8,0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color:#fff; font-size:16px; font-weight:500;
    line-height:1.4; padding:6px 14px; border-radius:6px;
    text-align:center; max-width:80%;
    opacity:0; transform:translateY(4px);
    transition: opacity .18s ease, transform .18s ease;
  }
  .subtitle-overlay .cue.show{ opacity:1; transform:translateY(0); }

  @media (max-width:760px){
    .top-bar{ top:12px; left:12px; right:12px; }
    .title-block{ padding:8px 12px; border-radius:11px; max-width:62%; }
    .title-block h1{ font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .title-block .kicker{ font-size:9.5px; }
    .icon-btn{ width:32px; height:32px; border-radius:9px; }
    .icon-btn svg{ width:15px; height:15px; }

    .bottom-bar{ left:10px; right:10px; bottom:10px; padding:8px 10px 10px; border-radius:14px; }
    .skip-pill{ right:12px; bottom:100px; font-size:12px; padding:8px 12px; }
    .subtitle-overlay{ bottom:92px; padding:0 14px; }
    .subtitle-overlay.controls-hidden{ bottom:20px; }
    .subtitle-overlay .cue{ font-size:14px; padding:5px 11px; max-width:92%; }
  }

  @media (max-width:560px){
    .transport-btn.seek{ width:40px; height:40px; }
    .transport-btn.seek svg{ width:18px; height:18px; }
    .transport-btn.play{ width:56px; height:56px; }
    .transport-btn.play svg{ width:22px; height:22px; }
    .title-block h1{ font-size:13px; }
    .center-transport{ gap:16px; }

    .progress-row{ gap:6px; margin-bottom:6px; }
    .time{ font-size:10.5px; min-width:30px; }
    .scrub-track{ height:24px; }

    .controls-row{ gap:2px; }
    .controls-left{ gap:2px; flex:1; min-width:0; }
    .controls-right{ gap:0; }
    .flat-btn{ width:28px; height:28px; border-radius:6px; }
    .flat-btn svg{ width:16px; height:16px; }

    .vol-wrap input[type=range]{ width:42px; opacity:1; }

    .time-display{ display:none; }

    .menu{ min-width:168px; font-size:12.5px; bottom:38px; }
    .menu-item{ padding:6px 7px; font-size:12.5px; }
    .menu-heading{ font-size:10px; }

    .skip-pill{ right:10px; bottom:92px; font-size:11.5px; padding:7px 10px; gap:6px; }
    .skip-pill svg{ width:12px; height:12px; }
    .subtitle-overlay{ bottom:82px; }
    .subtitle-overlay .cue{ font-size:12.5px; }
  }

  @media (max-width:380px){
    .title-block{ max-width:56%; padding:7px 10px; }
    .title-block h1{ font-size:12px; }
    .title-block .kicker{ display:none; }
    .transport-btn.play{ width:50px; height:50px; }
    .center-transport{ gap:12px; }
    .controls-right .flat-btn:nth-child(3){ display:none; }
    .vol-wrap input[type=range]{ width:32px; }
  }

  @media (max-height:420px){
    .top-bar{ top:8px; left:8px; right:8px; }
    .title-block{ padding:6px 10px; }
    .title-block .kicker{ display:none; }
    .bottom-bar{ bottom:8px; left:8px; right:8px; padding:6px 10px 8px; }
    .progress-row{ margin-bottom:4px; }
    .transport-btn.play{ width:46px; height:46px; }
    .transport-btn.seek{ width:36px; height:36px; }
    .center-transport{ gap:14px; }
    .skip-pill{ bottom:70px; padding:6px 10px; font-size:11.5px; }
    .subtitle-overlay{ bottom:64px; }
  }
</style>
</head>
<body>

    <div class="player" id="player" tabindex="0">
    <video id="video" playsinline preload="metadata"></video>

    <div class="subtitle-overlay" id="subtitleOverlay"><div class="cue" id="subtitleCue"></div></div>

    <div class="spinner" id="spinner"></div>

    <div class="top-bar" id="topBar">
      <div class="title-block">
        <p class="kicker">AnimeZilla</p>
        <h1 id="videoTitle">Player</h1>
      </div>
    </div>

    <div class="skip-pill" id="skipIntro">
      Skip Intro
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4l10 8-10 8V4zM19 5v14" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="skip-pill" id="skipOutro">
      Skip Outro
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4l10 8-10 8V4zM19 5v14" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>

    <div class="seek-flash left" id="flashLeft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      10s
    </div>
    <div class="seek-flash right" id="flashRight">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M6 17l5-5-5-5M13 17l5-5-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      10s
    </div>

    <div class="center-transport" id="centerTransport">
      <button class="transport-btn seek" id="back10" aria-label="Back 10 seconds">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 1 1 2.6 5.9" stroke-linecap="round"/><path d="M4 6v5h5" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.5" font-size="7.5" fill="currentColor" stroke="none" text-anchor="middle" font-family="Space Grotesk">10</text></svg>
      </button>
      <button class="transport-btn play" id="playBtn" aria-label="Play">
        <svg id="playIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="transport-btn seek" id="fwd10" aria-label="Forward 10 seconds">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12a8 8 0 1 0-2.6 5.9" stroke-linecap="round"/><path d="M20 6v5h-5" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.5" font-size="7.5" fill="currentColor" stroke="none" text-anchor="middle" font-family="Space Grotesk">10</text></svg>
      </button>
    </div>

    <div class="bottom-bar" id="bottomBar">
      <div class="progress-row">
        <span class="time" id="curTime">0:00</span>
        <div class="scrub-track" id="scrubTrack">
          <div class="rail"></div>
          <div class="buffered" id="bufferedBar"></div>
          <div class="played" id="playedBar"></div>
          <div class="knob" id="knob"></div>
        </div>
        <span class="time" id="durTime">0:00</span>
      </div>

      <div class="controls-row">
        <div class="controls-left">
          <button class="flat-btn" id="playBtnSmall" aria-label="Play/pause">
            <svg id="playIconSmall" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <div class="vol-wrap" id="volWrap">
            <button class="flat-btn" id="muteBtn" aria-label="Mute">
              <svg id="volIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round"/></svg>
            </button>
            <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="1">
          </div>
          <span class="time-display" id="fullTime">0:00 / 0:00</span>
        </div>

        <div class="controls-right">
          <div class="menu-wrap">
            <button class="flat-btn" id="ccBtn" aria-label="Subtitles">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10.5h3M7 13.5h2M14 10.5h3M14 13.5h2.5" stroke-linecap="round"/></svg>
            </button>
            <div class="menu" id="ccMenu">
              <div class="menu-section">
                <div class="menu-heading">Subtitles</div>
                <div class="menu-item selected" data-cc="-1">Off <span class="check">&#10003;</span></div>
              </div>
            </div>
          </div>

          <div class="menu-wrap">
            <button class="flat-btn" id="speedBtn" aria-label="Playback speed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="13" r="8"/><path d="M12 13l3-3M9 4h6" stroke-linecap="round"/></svg>
            </button>
            <div class="menu" id="speedMenu">
              <div class="menu-section">
                <div class="menu-heading">Playback speed</div>
                <div class="menu-item" data-speed="0.5">0.5x <span class="check">&#10003;</span></div>
                <div class="menu-item" data-speed="0.75">0.75x <span class="check">&#10003;</span></div>
                <div class="menu-item selected" data-speed="1">Normal <span class="check">&#10003;</span></div>
                <div class="menu-item" data-speed="1.25">1.25x <span class="check">&#10003;</span></div>
                <div class="menu-item" data-speed="1.5">1.5x <span class="check">&#10003;</span></div>
                <div class="menu-item" data-speed="2">2x <span class="check">&#10003;</span></div>
              </div>
            </div>
          </div>

          <div class="menu-wrap">
            <button class="flat-btn" id="qualityBtn" aria-label="Quality">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="menu" id="qualityMenu">
              <div class="menu-section">
                <div class="menu-heading">Quality</div>
                <div class="menu-item selected" data-quality="-1">Auto <span class="check">&#10003;</span></div>
              </div>
            </div>
          </div>

          <button class="flat-btn" id="pipBtn" aria-label="Picture in picture">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg>
          </button>
          <button class="flat-btn" id="fsBtn" aria-label="Fullscreen">
            <svg id="fsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

<script>
(function(){
  var cfg={m3u8:null,tracks:[],intro:null,outro:null,title:""};
  try{cfg=window.__PLAYER_CONFIG__||cfg}catch(e){}

  const player=document.getElementById('player');
  const video=document.getElementById('video');
  const spinner=document.getElementById('spinner');
  const videoTitle=document.getElementById('videoTitle');
  const topBar=document.getElementById('topBar');
  const bottomBar=document.getElementById('bottomBar');
  const centerTransport=document.getElementById('centerTransport');
  const skipIntro=document.getElementById('skipIntro');
  const skipOutro=document.getElementById('skipOutro');
  const scrubTrack=document.getElementById('scrubTrack');
  const playedBar=document.getElementById('playedBar');
  const bufferedBar=document.getElementById('bufferedBar');
  const knob=document.getElementById('knob');
  const curTime=document.getElementById('curTime');
  const durTime=document.getElementById('durTime');
  const fullTime=document.getElementById('fullTime');
  const playBtn=document.getElementById('playBtn');
  const playBtnSmall=document.getElementById('playBtnSmall');
  const playIcons=[document.getElementById('playIcon'),document.getElementById('playIconSmall')];
  const muteBtn=document.getElementById('muteBtn');
  const volIcon=document.getElementById('volIcon');
  const volSlider=document.getElementById('volumeSlider');
  const ccBtn=document.getElementById('ccBtn');
  const ccMenu=document.getElementById('ccMenu');
  const speedBtn=document.getElementById('speedBtn');
  const speedMenu=document.getElementById('speedMenu');
  const qualityBtn=document.getElementById('qualityBtn');
  const qualityMenu=document.getElementById('qualityMenu');
  const pipBtn=document.getElementById('pipBtn');
  const fsBtn=document.getElementById('fsBtn');

  if(cfg.title){videoTitle.textContent=cfg.title;document.title=cfg.title+" - Player"}

  const PLAY_SVG='<path d="M8 5v14l11-7z"/>';
  const PAUSE_SVG='<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
  const VOL_SVG='<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round"/>';
  const MUTE_SVG='<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6" stroke-linecap="round"/>';

  function fmt(s){
    if(!isFinite(s)||s<0)s=0;
    s=Math.floor(s);
    var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
    var mm=h?String(m).padStart(2,'0'):m;
    return(h?h+':':'')+mm+':'+String(sec).padStart(2,'0');
  }
  function setPlayIcon(playing){playIcons.forEach(function(i){i.innerHTML=playing?PAUSE_SVG:PLAY_SVG})}
  function togglePlay(){if(video.paused||video.ended)video.play();else video.pause()}

  playBtn.addEventListener('click',togglePlay);
  playBtnSmall.addEventListener('click',togglePlay);

  video.addEventListener('play',function(){
    setPlayIcon(true);
    player.classList.remove('is-paused');
  });
  video.addEventListener('pause',function(){
    setPlayIcon(false);
    player.classList.add('is-paused');
  });
  video.addEventListener('waiting',function(){spinner.classList.add('show')});
  video.addEventListener('playing',function(){spinner.classList.remove('show')});
  video.addEventListener('canplay',function(){spinner.classList.remove('show')});

  function seekBy(sec){
    video.currentTime=Math.min(Math.max(0,video.currentTime+sec),video.duration||1e9);
  }
  function flash(el){
    el.classList.add('active');
    clearTimeout(el._t);
    el._t=setTimeout(function(){el.classList.remove('active')},450);
  }
  document.getElementById('back10').addEventListener('click',function(e){e.stopPropagation();seekBy(-10);flash(document.getElementById('flashLeft'))});
  document.getElementById('fwd10').addEventListener('click',function(e){e.stopPropagation();seekBy(10);flash(document.getElementById('flashRight'))});

  video.addEventListener('timeupdate',function(){
    if(!video.duration)return;
    var pct=(video.currentTime/video.duration)*100;
    playedBar.style.width=pct+'%';
    knob.style.left=pct+'%';
    curTime.textContent=fmt(video.currentTime);
    fullTime.textContent=fmt(video.currentTime)+' / '+fmt(video.duration);
    renderSubtitle();
    checkSkip();
  });
  video.addEventListener('loadedmetadata',function(){
    durTime.textContent=fmt(video.duration);
    fullTime.textContent=fmt(video.currentTime)+' / '+fmt(video.duration);
  });
  video.addEventListener('progress',function(){
    if(video.buffered.length&&video.duration){
      var end=video.buffered.end(video.buffered.length-1);
      bufferedBar.style.width=(end/video.duration*100)+'%';
    }
  });

  function scrubTo(clientX){
    var rect=scrubTrack.getBoundingClientRect();
    var pct=Math.min(1,Math.max(0,(clientX-rect.left)/rect.width));
    video.currentTime=pct*(video.duration||0);
  }
  var scrubbing=false;
  scrubTrack.addEventListener('mousedown',function(e){scrubbing=true;scrubTo(e.clientX)});
  window.addEventListener('mousemove',function(e){if(scrubbing)scrubTo(e.clientX)});
  window.addEventListener('mouseup',function(){scrubbing=false});
  scrubTrack.addEventListener('touchstart',function(e){scrubbing=true;scrubTo(e.touches[0].clientX)},{passive:true});
  scrubTrack.addEventListener('touchmove',function(e){if(scrubbing)scrubTo(e.touches[0].clientX)},{passive:true});
  scrubTrack.addEventListener('touchend',function(){scrubbing=false});

  var lastVolume=1;
  volSlider.addEventListener('input',function(){
    video.volume=volSlider.value;
    video.muted=video.volume===0;
    if(video.volume>0)lastVolume=video.volume;
    volIcon.innerHTML=video.muted?MUTE_SVG:VOL_SVG;
  });
  muteBtn.addEventListener('click',function(){
    video.muted=!video.muted;
    if(video.muted){
      if(video.volume>0)lastVolume=video.volume;
      volSlider.value=0;
    }else{
      video.volume=video.volume===0?(lastVolume||0.6):video.volume;
      volSlider.value=video.volume;
    }
    volIcon.innerHTML=video.muted?MUTE_SVG:VOL_SVG;
  });
  video.addEventListener('volumechange',function(){
    volSlider.value=video.muted?0:video.volume;
    volIcon.innerHTML=video.muted?MUTE_SVG:VOL_SVG;
  });

  function wireMenu(btn,menu){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      document.querySelectorAll('.menu.show').forEach(function(m){if(m!==menu)m.classList.remove('show')});
      menu.classList.toggle('show');
    });
  }
  wireMenu(speedBtn,speedMenu);
  wireMenu(qualityBtn,qualityMenu);
  wireMenu(ccBtn,ccMenu);
  document.addEventListener('click',function(){document.querySelectorAll('.menu.show').forEach(function(m){m.classList.remove('show')})});

  document.querySelectorAll('#speedMenu .menu-item').forEach(function(item){
    item.addEventListener('click',function(){
      video.playbackRate=parseFloat(item.dataset.speed);
      speedMenu.querySelectorAll('.menu-item').forEach(function(i){i.classList.remove('selected')});
      item.classList.add('selected');
      speedMenu.classList.remove('show');
    });
  });

  // Custom subtitle system
  var subtitleOverlay=document.getElementById('subtitleOverlay');
  var subtitleCue=document.getElementById('subtitleCue');
  var subtitlesOn=true;
  var activeSubIdx=-1;
  var subCues=[];

  function parseVTT(text){
    var cues=[];
    var CR=String.fromCharCode(13);var LF=String.fromCharCode(10);var CRLF=CR+LF;
    var lines=text.split(CRLF).join(LF).split(LF);
    var i=0;
    while(i<lines.length&&lines[i].trim()!=='')i++;
    while(i<lines.length){
      while(i<lines.length&&lines[i].trim()==='')i++;
      if(i>=lines.length)break;
      var timeLine=lines[i];i++;
      if(!timeLine||timeLine.indexOf('-->')===-1)continue;
      var ts='(\\\\d{1,2}):(\\\\d{2}):(\\\\d{2})\\\\.(\\\\d{3})\\\\s*-->\\\\s*(\\\\d{1,2}):(\\\\d{2}):(\\\\d{2})\\\\.(\\\\d{3})';
      var tm=timeLine.match(new RegExp(ts));
      if(!tm){var ts2='(\\\\d{2}):(\\\\d{2})\\\\.(\\\\d{3})\\\\s*-->\\\\s*(\\\\d{2}):(\\\\d{2})\\\\.(\\\\d{3})';tm=timeLine.match(new RegExp(ts2));if(tm){tm=[0,'0',tm[1],tm[2],tm[3],'0',tm[4],tm[5],tm[6]]}else continue}
      var start=parseInt(tm[1])*3600+parseInt(tm[2])*60+parseInt(tm[3])+parseInt(tm[4])/1000;
      var end=parseInt(tm[5])*3600+parseInt(tm[6])*60+parseInt(tm[7])+parseInt(tm[8])/1000;
      var txt='';
      while(i<lines.length&&lines[i].trim()!==''){
        if(txt)txt+=LF;
        txt+=lines[i].replace(/<[^>]+>/g,'').trim();
        i++;
      }
      if(txt)cues.push({start:start,end:end,text:txt});
    }
    return cues;
  }

  async function loadSubTrack(url){
    try{
      var r=await fetch(url);
      if(!r.ok)return[];
      var t=await r.text();
      return parseVTT(t);
    }catch(e){return[]}
  }

  async function initCustomSubs(){
    var tracks=cfg.tracks||[];
    var subTracks=tracks.filter(function(t){return t.file});
    if(!subTracks.length)return;
    ccMenu.querySelector('.menu-section').innerHTML='<div class="menu-heading">Subtitles</div><div class="menu-item selected" data-cc="-1">Off <span class="check">&#10003;</span></div>';
    subTracks.forEach(function(trk,i){
      var div=document.createElement('div');
      div.className='menu-item';div.setAttribute('data-cc',String(i));
      div.innerHTML=(trk.label||trk.lang||'Sub '+(i+1)).replace(/</g,'&lt;')+' <span class="check">&#10003;</span>';
      ccMenu.querySelector('.menu-section').appendChild(div);
    });
    var loaded=[];
    for(var i=0;i<subTracks.length;i++){
      loaded.push(loadSubTrack(subTracks[i].file));
    }
    var results=await Promise.all(loaded);
    if(results.length>0&&results[0].length>0){
      activeSubIdx=0;
      subCues=results[0];
      subtitlesOn=true;
    }
    ccMenu.querySelectorAll('.menu-item').forEach(function(item){
      item.addEventListener('click',function(){
        var idx=parseInt(item.dataset.cc,10);
        activeSubIdx=idx;
        if(idx>=0&&idx<results.length){subCues=results[idx];subtitlesOn=true}
        else{subCues=[];subtitlesOn=false}
        ccMenu.querySelectorAll('.menu-item').forEach(function(i){i.classList.remove('selected')});
        item.classList.add('selected');
        ccMenu.classList.remove('show');
        renderSubtitle();
      });
    });
  }

  function renderSubtitle(){
    if(!subtitlesOn||!subCues.length){subtitleCue.classList.remove('show');return}
    var t=video.currentTime;
    for(var i=0;i<subCues.length;i++){
      if(t>=subCues[i].start&&t<=subCues[i].end){
        if(subtitleCue.textContent!==subCues[i].text)subtitleCue.textContent=subCues[i].text;
        subtitleCue.classList.add('show');
        return;
      }
    }
    subtitleCue.classList.remove('show');
  }

  initCustomSubs();

  // Position overlay based on controls
  function updateSubPosition(){
    if(player.classList.contains('hide-cursor')){subtitleOverlay.classList.add('controls-hidden')}
    else{subtitleOverlay.classList.remove('controls-hidden')}
  }

  var hls=null;
  var src=cfg.m3u8;
  if(src){
    if(window.Hls&&Hls.isSupported()){
      hls=new Hls({maxBufferLength:30,maxMaxBufferLength:60,startFragPrefetch:true,debug:false});
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED,function(e,data){
        var levels=data.levels||[];
        var qMenu=qualityMenu.querySelector('.menu-section');
        qMenu.innerHTML='<div class="menu-heading">Quality</div><div class="menu-item selected" data-quality="-1">Auto <span class="check">&#10003;</span></div>';
        levels.forEach(function(lv,i){
          var h=lv.height||lv.width||'?';
          var div=document.createElement("div");
          div.className="menu-item";div.setAttribute("data-quality",String(i));
          div.innerHTML=h+'p <span class="check">&#10003;</span>';
          qMenu.appendChild(div);
        });
        qMenu.querySelectorAll('.menu-item').forEach(function(item){
          item.addEventListener('click',function(){
            var lv=parseInt(item.dataset.quality,10);
            hls.currentLevel=lv;
            qMenu.querySelectorAll('.menu-item').forEach(function(r){r.classList.remove('selected')});
            item.classList.add('selected');
            qualityMenu.classList.remove('show');
          });
        });
        video.play();
      });
      hls.on(Hls.Events.ERROR,function(e,data){if(data.fatal){if(data.type===Hls.ErrorTypes.NETWORK_ERROR){hls.startLoad()}else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError()}}});
    }else if(video.canPlayType('application/vnd.apple.mpegurl')){
      video.src=src;video.addEventListener('loadedmetadata',function(){video.play()});
    }
  }

  pipBtn.addEventListener('click',async function(){
    try{if(document.pictureInPictureElement){await document.exitPictureInPicture()}else{await video.requestPictureInPicture()}}catch(e){}
  });
  fsBtn.addEventListener('click',function(){
    if(!document.fullscreenElement){player.requestFullscreen&&player.requestFullscreen()}
    else{document.exitFullscreen&&document.exitFullscreen()}
  });

  function checkSkip(){
    var t=video.currentTime;
    if(cfg.intro&&cfg.intro.start!==cfg.intro.end&&t>=cfg.intro.start&&t<cfg.intro.end){skipIntro.classList.add('show')}
    else{skipIntro.classList.remove('show')}
    if(cfg.outro&&cfg.outro.start!==cfg.outro.end&&t>=cfg.outro.start&&t<cfg.outro.end){skipOutro.classList.add('show')}
    else{skipOutro.classList.remove('show')}
  }
  skipIntro.addEventListener('click',function(e){e.stopPropagation();if(cfg.intro)video.currentTime=cfg.intro.end});
  skipOutro.addEventListener('click',function(e){e.stopPropagation();if(cfg.outro)video.currentTime=cfg.outro.end});

  var hideTimer=null;
  function showControls(){
    [topBar,bottomBar,centerTransport].forEach(function(el){el.classList.remove('hide')});
    player.classList.remove('hide-cursor');
    subtitleOverlay.classList.remove('controls-hidden');
    clearTimeout(hideTimer);
    if(!video.paused){hideTimer=setTimeout(hideControls,3000)}
  }
  function hideControls(){
    if(document.querySelector('.menu.show'))return;
    [topBar,bottomBar,centerTransport].forEach(function(el){el.classList.add('hide')});
    player.classList.add('hide-cursor');
    subtitleOverlay.classList.add('controls-hidden');
  }
  ['mousemove','mousedown','touchstart','keydown'].forEach(function(evt){player.addEventListener(evt,showControls)});
  video.addEventListener('pause',showControls);
  video.addEventListener('play',showControls);
  showControls();
  player.classList.add('is-paused');

  var clickTimer=null;
  player.addEventListener('click',function(e){
    if(e.target.closest('.icon-btn,.flat-btn,.menu,.transport-btn,.skip-pill,.scrub-track,.vol-wrap'))return;
    if(clickTimer){
      clearTimeout(clickTimer);clickTimer=null;
      var rect=player.getBoundingClientRect();
      var x=e.clientX-rect.left;
      if(x<rect.width/2){seekBy(-10);flash(document.getElementById('flashLeft'))}
      else{seekBy(10);flash(document.getElementById('flashRight'))}
    }else{
      clickTimer=setTimeout(function(){clickTimer=null;togglePlay()},220);
    }
  });

  player.addEventListener('keydown',function(e){
    switch(e.key){
      case ' ':case 'k':e.preventDefault();togglePlay();break;
      case 'ArrowRight':e.preventDefault();seekBy(5);break;
      case 'ArrowLeft':e.preventDefault();seekBy(-5);break;
      case 'l':seekBy(10);break;
      case 'j':seekBy(-10);break;
      case 'f':fsBtn.click();break;
      case 'm':muteBtn.click();break;
      case 'ArrowUp':e.preventDefault();video.volume=Math.min(1,video.volume+0.05);volSlider.value=video.volume;break;
      case 'ArrowDown':e.preventDefault();video.volume=Math.max(0,video.volume-0.05);volSlider.value=video.volume;break;
    }
  });
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

    // ====== MegaPlay Watch Page ======
    // GET /api/watch/megaplay/{anilist-id}/{episode}/{language}  — plays video in our player
    var megaplayStreamMatch = url.match(/^\/api\/watch\/megaplay\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (megaplayStreamMatch) {
      var mpAnilistId = Number(megaplayStreamMatch[1]);
      var mpEpisode = Number(megaplayStreamMatch[2]);
      var mpLang = megaplayStreamMatch[3];

      // Always resolve AniList → MAL
      var mpAniInfo = await fetchAnilistInfo(mpAnilistId);
      var mpMalId = mpAniInfo.malId;
      var mpTitle = mpAniInfo.title || "";
      if (!mpMalId) {
        return new Response(JSON.stringify({ success: false, error: "No MAL ID found for AniList ID " + mpAnilistId }), { status: 404, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
      }

      // Helper: check if m3u8 URL is from a working CDN (reject vibeplayer.site — it's dead)
      function isValidStream(m3u8) {
        if (!m3u8) return false;
        if (m3u8.indexOf("vibeplayer") > -1) return false;
        return true;
      }

      // Strategy 1: Try NekoStream first (nekostream.site URLs work)
      var mpResult = null;
      try {
        var mpNeko = await scrapeNekoStream(mpMalId, mpEpisode);
        if (mpNeko && mpNeko[mpLang] && isValidStream(mpNeko[mpLang].m3u8)) {
          mpResult = mpNeko[mpLang];
        }
      } catch (e) { /* fall through */ }

      // Strategy 2: Try scrapeMegaplay but reject vibeplayer URLs
      if (!mpResult) {
        try {
          var mpScraped = await scrapeMegaplay(mpMalId, mpEpisode);
          if (mpScraped && mpScraped[mpLang] && isValidStream(mpScraped[mpLang].m3u8)) {
            mpResult = mpScraped[mpLang];
          }
        } catch (e) { /* fall through */ }
      }

      // Strategy 3: Try AniList ID endpoint on MegaPlay
      if (!mpResult) {
        try {
          var mpAniUrl = MEGAPLAY_BASE + "/stream/ani/" + mpAnilistId + "/" + mpEpisode + "/" + mpLang;
          var mpAniResp = await proxyFetch(mpAniUrl);
          if (mpAniResp.ok) {
            var mpAniHtml = await mpAniResp.text();
            var mpAniMatch = mpAniHtml.match(/data-id="(\d+)"/);
            if (mpAniMatch) {
              var mpAniSource = await getSource(Number(mpAniMatch[1]), "megaplay");
              var mpAniFormatted = Object.assign({ lang: mpLang }, formatResult(mpAniSource, { mal_id: String(mpMalId), episode: mpEpisode, source: "megaplay", dataId: Number(mpAniMatch[1]) }));
              if (isValidStream(mpAniFormatted.m3u8)) mpResult = mpAniFormatted;
            }
          }
        } catch (e) { /* fall through */ }
      }

      // Strategy 4: Try direct MAL endpoint via proxy
      if (!mpResult) {
        try {
          var mpDirectUrl = MEGAPLAY_BASE + "/stream/mal/" + mpMalId + "/" + mpEpisode + "/" + mpLang;
          var mpDirectResp = await proxyFetch(mpDirectUrl);
          if (mpDirectResp.ok) {
            var mpDirectHtml = await mpDirectResp.text();
            var mpDirectMatch = mpDirectHtml.match(/data-id="(\d+)"/);
            if (mpDirectMatch) {
              var mpDirectSource = await getSource(Number(mpDirectMatch[1]), "megaplay");
              var mpDirectFormatted = Object.assign({ lang: mpLang }, formatResult(mpDirectSource, { mal_id: String(mpMalId), episode: mpEpisode, source: "megaplay", dataId: Number(mpDirectMatch[1]) }));
              if (isValidStream(mpDirectFormatted.m3u8)) mpResult = mpDirectFormatted;
            }
          }
        } catch (e) { /* fall through */ }
      }

      if (!mpResult || !mpResult.m3u8) {
        return new Response(JSON.stringify({ success: false, error: "No working stream found for AniList " + mpAnilistId + " (MAL " + mpMalId + ") ep " + mpEpisode + " " + mpLang }), { status: 404, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
      }

      // Build player config with proxied URLs (detect CDN for correct headers)
      var mpStreamUrl = mpResult.m3u8;
      var mpReferer = "https://megaplay.buzz/";
      var mpOrigin = "https://megaplay.buzz";
      if (mpStreamUrl.indexOf("nekostream") > -1 || mpStreamUrl.indexOf("lostproject") > -1) {
        mpReferer = "https://anikototv.to/";
        mpOrigin = "https://anikototv.to";
      } else if (mpStreamUrl.indexOf("vibeplayer") > -1) {
        mpReferer = "https://vibeplayer.site/";
        mpOrigin = "https://vibeplayer.site";
      } else if (mpStreamUrl.indexOf("megacloud") > -1) {
        mpReferer = "";
        mpOrigin = "";
      }
      var mpProxyHeaders = encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": mpReferer, "Origin": mpOrigin }));
      var mpPlayerConfig = {
        m3u8: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(mpStreamUrl) + "&headers=" + mpProxyHeaders,
        tracks: (mpResult.tracks || []).map(function(t) {
          var tHeaders = encodeURIComponent(JSON.stringify({ "User-Agent": UA, "Referer": mpReferer, "Origin": mpOrigin }));
          return { label: t.label || "English", lang: t.srclang || t.label ? t.label.substring(0, 2).toLowerCase() : "en", file: t.file ? serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + tHeaders : "", kind: t.kind || "captions", default: t.default || false };
        }).filter(function(t) { return t.url; }),
        intro: mpResult.intro || null,
        outro: mpResult.outro || null,
        title: mpTitle + " - Ep " + mpEpisode + " (" + mpLang + ")"
      };

      var mpPlayerPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(mpPlayerConfig) + ";</script></head>");
      return new Response(mpPlayerPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
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

      if (!wAnilistInfo.malId) {
        return new Response(JSON.stringify({ error: "No MAL ID found for anilist " + wAnilistId }), { status: 404, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
      }

      // Step 1: Try scrapeMegaplay (sub + dub via proxy)
      var wScraped = null;
      try {
        wScraped = await scrapeMegaplay(wAnilistInfo.malId, wEpisode);
      } catch (e) {}

      // Step 2: If specific lang missing, try individual scrape
      if (!wScraped || !wScraped[wLang]) {
        try {
          var wUrl = MEGAPLAY_BASE + "/stream/mal/" + wAnilistInfo.malId + "/" + wEpisode + "/" + wLang;
          var wResp = await proxyFetch(wUrl);
          if (wResp.ok) {
            var wHtml = await wResp.text();
            var wMatch = wHtml.match(/data-id="(\d+)"/);
            if (wMatch) {
              var wSource = await getSource(Number(wMatch[1]), "megaplay");
              if (!wScraped) wScraped = {};
              wScraped[wLang] = Object.assign({ lang: wLang }, formatResult(wSource, { mal_id: String(wAnilistInfo.malId), episode: wEpisode, source: "megaplay", dataId: Number(wMatch[1]) }));
            }
          }
        } catch (e) {}
      }

      // Step 3: If still missing, try AniList ID endpoint
      if (!wScraped || !wScraped[wLang]) {
        try {
          var wUrl2 = MEGAPLAY_BASE + "/stream/ani/" + wAnilistId + "/" + wEpisode + "/" + wLang;
          var wResp2 = await proxyFetch(wUrl2);
          if (wResp2.ok) {
            var wHtml2 = await wResp2.text();
            var wMatch2 = wHtml2.match(/data-id="(\d+)"/);
            if (wMatch2) {
              var wSource2 = await getSource(Number(wMatch2[1]), "megaplay");
              if (!wScraped) wScraped = {};
              wScraped[wLang] = Object.assign({ lang: wLang }, formatResult(wSource2, { mal_id: String(wAnilistInfo.malId), episode: wEpisode, source: "megaplay", dataId: Number(wMatch2[1]) }));
            }
          }
        } catch (e) {}
      }

      if (!wScraped || !wScraped[wLang]) {
        return new Response(JSON.stringify({ error: "MegaPlay: no source found for " + wTitle + " ep " + wEpisode + " " + wLang }), { status: 404, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
      }

      var wResult = wScraped[wLang];

      // Proxy m3u8 and track URLs through our proxy so they work from browser
      if (wResult.m3u8) {
        wResult.m3u8 = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wResult.m3u8) + "&headers=" + encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" }));
      }
      if (wResult.tracks) {
        wResult.tracks = wResult.tracks.map(function(t) {
          return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" })) });
        });
      }

      // Build response matching our standard player format
      var wCfg = {
        m3u8: wResult.m3u8,
        tracks: wResult.tracks || [],
        intro: wResult.intro || null,
        outro: wResult.outro || null,
        title: wTitle + " - Episode " + wEpisode + " (" + wLang.toUpperCase() + ")",
      };

      // Also return available languages
      var wAvail = {};
      if (wScraped.sub) wAvail.sub = true;
      if (wScraped.dub) wAvail.dub = true;

      return new Response(JSON.stringify({ ok: true, anilist_id: wAnilistId, mal_id: wAnilistInfo.malId, episode: wEpisode, title: wTitle, available: wAvail, config: wCfg }), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
    }

    function serveAnikageServer(aniId, ep, lang, serverName) {
      return async function() {
        var wAnilistInfo = await fetchAnilistInfo(aniId);
        var wTitle = wAnilistInfo.title;
        var allProviders = ["neko", "koto", "miko", "dib", "wave", "senshi"];
        var wData = null;
        var usedServer = serverName;

        // Step 1: Try requested provider first with 12s timeout
        try {
          wData = await Promise.race([
            scrapeVaromine(aniId, ep, lang, serverName),
            new Promise(function(_, rej) { setTimeout(function() { rej("timeout"); }, 12000); })
          ]);
          if (wData) usedServer = serverName;
        } catch (e) { wData = null; }

        // Step 2: If requested provider failed, race ALL remaining in parallel
        if (!wData) {
          var remaining = allProviders.filter(function(p) { return p !== serverName; });
          var firstWinner = null;
          var allSettled = false;
          var remainingPromises = remaining.map(function(p) {
            return scrapeVaromine(aniId, ep, lang, p).then(function(d) {
              if (!allSettled && d && !firstWinner) { firstWinner = { server: p, data: d }; allSettled = true; }
            }).catch(function() {});
          });
          await new Promise(function(resolve) {
            var settled = 0;
            var total = remainingPromises.length;
            if (total === 0) { resolve(); return; }
            remainingPromises.forEach(function(pr) {
              pr.then(function() {
                settled++;
                if (firstWinner || settled >= total) resolve();
              }).catch(function() {
                settled++;
                if (firstWinner || settled >= total) resolve();
              });
            });
          });
          if (firstWinner) {
            wData = firstWinner.data;
            usedServer = firstWinner.server;
          }
        }

        // Step 3: If tracks empty, try to get subtitle VTT URLs from softsub sources
        if (wData && (!wData.tracks || wData.tracks.length === 0)) {
          try {
            var subTracks = [];
            var subProviders = ["neko", "koto", "miko", "dib", "wave", "senshi"];
            for (var sp = 0; sp < subProviders.length && subTracks.length === 0; sp++) {
              var spUrl = ANIKAGE_API_BASE + "/" + aniId + "/episodes/" + ep + "/sources?provider=" + subProviders[sp] + "&lang=" + (lang || "sub");
              var spR = await fetch(spUrl, { headers: ANIKAGE_HEADERS, signal: AbortSignal.timeout(10000) });
              if (spR.ok) {
                var spData = await spR.json();
                if (spData && spData.sources) {
                  for (var si = 0; si < spData.sources.length; si++) {
                    if (spData.sources[si].embedUrl) {
                      var sm = spData.sources[si].embedUrl.match(/[?&]sub=([^&]+)/);
                      if (sm) {
                        var su = decodeURIComponent(sm[1]);
                        if (su && su.startsWith("http") && !subTracks.some(function(t) { return t.file === su; })) {
                          subTracks.push({ file: su, label: "English", kind: "captions", default: subTracks.length === 0 });
                        }
                      }
                    }
                  }
                }
              }
            }
            if (subTracks.length > 0) wData.tracks = subTracks;
          } catch (e) {}
        }

        if (!wData) {
          var notAvailPage = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:radial-gradient(ellipse at 50% 0%,#1a0505 0%,#060202 70%);font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#ffe6e8;display:flex;align-items:center;justify-content:center;overflow:hidden}.box{text-align:center;padding:40px;border:1px solid rgba(255,30,60,0.3);border-radius:16px;background:rgba(255,30,60,0.05);backdrop-filter:blur(10px);max-width:400px}.icon{width:60px;height:60px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#f72585);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(255,30,60,0.3)}.icon svg{width:28px;height:28px;fill:#fff}h2{font-size:18px;margin-bottom:8px;color:#ff6b35}p{font-size:13px;color:rgba(255,230,232,0.5);line-height:1.5}.tag{display:inline-block;margin-top:16px;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:1px;background:rgba(255,107,53,0.15);color:#ff6b35;border:1px solid rgba(255,107,53,0.3)}</style></head><body><div class="box"><div class="icon"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg></div><h2>Not Available</h2><p>' + lang.toUpperCase() + ' stream not available for Episode ' + ep + '</p><div class="tag">TRY MEGAPLAY SERVER</div></div></body></html>';
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