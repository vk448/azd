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

const ANIKAGE_PROXY_URL = "https://prox.anicore.tv";
const ANIKAGE_MEGACLOUD_PROXY = "https://megacloud.animanga.fun/proxy";
const ANIKAGE_API_BASE = "https://anikage.cc/api/media/anime";
const ANIKAGE_HEADERS = {
  "User-Agent": UA,
  "Referer": "https://anikage.cc/",
  "Origin": "https://anikage.cc",
  "Accept": "application/json, text/plain, */*",
};

function anikageBuildProxyUrl(token, type) {
  if (!token) return "";
  if (token.startsWith("http://") || token.startsWith("https://")) return token;
  var rawUrl = ANIKAGE_PROXY_URL + "/" + (type || "m3u8") + "/" + token;
  var hdrs = JSON.stringify({ "User-Agent": UA, "Referer": "https://anikage.cc/", "Origin": "https://anikage.cc", "Accept": "*/*" });
  return ANIKAGE_MEGACLOUD_PROXY + "?url=" + encodeURIComponent(rawUrl) + "&headers=" + encodeURIComponent(hdrs);
}

async function anikageGetServers(slug, episode) {
  const r = await fetch(ANIKAGE_API_BASE + "/" + slug + "/episodes/" + episode + "/servers", { headers: ANIKAGE_HEADERS });
  if (!r.ok) throw new Error("Servers fetch failed: " + r.status);
  return await r.json();
}

async function anikageGetSources(slug, episode, provider, lang) {
  const r = await fetch(ANIKAGE_API_BASE + "/" + slug + "/episodes/" + episode + "/sources?provider=" + provider + "&lang=" + lang, { headers: ANIKAGE_HEADERS });
  if (!r.ok) throw new Error("Sources fetch failed: " + r.status);
  return await r.json();
}

async function scrapeAnikage(slugOrId, episode) {
  var cacheKey = "ak-" + slugOrId + "-" + episode;
  var cached = getScrapeCache(cacheKey);
  if (cached) return cached;

  var serversData = await anikageGetServers(slugOrId, episode);
  var servers = serversData.servers || [];
  var results = { neko: { sub: null, dub: null }, koto: { sub: null, dub: null }, serverList: servers.map(function(s) { return s.id; }) };
  var targetServers = ["neko", "koto"];

  var tasks = [];
  for (var si = 0; si < targetServers.length; si++) {
    var serverId = targetServers[si];
    var server = servers.find(function(s) { return s.id === serverId; });
    if (!server) continue;
    var langs = ["sub", "dub"];
    for (var li = 0; li < langs.length; li++) {
      var lang = langs[li];
      if (!server.subTypes.includes(lang)) continue;
      tasks.push({ serverId: serverId, lang: lang, slugOrId: slugOrId, episode: episode });
    }
  }

  var taskResults = await Promise.allSettled(tasks.map(function(t) {
    return anikageGetSources(t.slugOrId, t.episode, t.serverId, t.lang).then(function(srcData) {
      if (!srcData.sources || srcData.sources.length === 0) return null;
      var bestSource = null;
      var softsubs = srcData.sources.filter(function(s) { return s.type === "softsub" && s.isM3U8; });
      var hardsubs = srcData.sources.filter(function(s) { return s.type === "hardsub" && s.isM3U8; });
      var dubs = srcData.sources.filter(function(s) { return s.type === "dub" && s.isM3U8; });
      var allM3u8 = srcData.sources.filter(function(s) { return s.isM3U8; });
      if (t.lang === "dub" && dubs.length > 0) bestSource = dubs[0];
      else if (softsubs.length > 0) bestSource = softsubs[0];
      else if (hardsubs.length > 0) bestSource = hardsubs[0];
      else if (allM3u8.length > 0) bestSource = allM3u8[0];
      if (!bestSource) return null;
      return {
        serverId: t.serverId, lang: t.lang,
        m3u8: anikageBuildProxyUrl(bestSource.url, "m3u8"),
        tracks: (srcData.subtitles || []).map(function(sub) { return { file: anikageBuildProxyUrl(sub.file, "m3u8"), label: sub.label, kind: sub.kind, default: sub.default }; }),
        intro: srcData.intro || { start: 0, end: 0 },
        outro: srcData.outro || { start: 0, end: 0 },
        quality: bestSource.quality, source: bestSource.type
      };
    }).catch(function() { return null; });
  }));

  for (var ti = 0; ti < taskResults.length; ti++) {
    if (taskResults[ti].status !== "fulfilled" || !taskResults[ti].value) continue;
    var r = taskResults[ti].value;
    results[r.serverId][r.lang] = {
      m3u8: r.m3u8, tracks: r.tracks,
      intro: r.intro, outro: r.outro,
      server: r.serverId, source: r.source, quality: r.quality
    };
  }

  cacheScrape(cacheKey, results);
  return results;
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
  var r = await fetch(base + "/stream/getSources?id=" + embedId + "&id=" + embedId, {
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

async function getFromGogoanime(malId, episode) {
  var r = await fetch("https://9anime.org.lv/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: "action=fetch_download_links&mal_id=" + malId + "&ep=" + episode
  });
  if (!r.ok) throw new Error("gogo " + r.status);
  var d = await r.json();
  if (!d.success || !d.data || d.data.status !== 200 || !d.data.result) throw new Error("No links");
  return parseDownloadHtml(d.data.result);
}

async function getDownloadLinksCached(malId, ep) {
  var key = "dl-" + malId + "-" + ep;
  var cached = getScrapeCache(key);
  if (cached) return cached;
  try {
    var from9 = await getFrom9Anime(malId, ep);
    if (from9 && (from9.sub.length > 0 || from9.dub.length > 0)) { cacheScrape(key, from9); return from9; }
  } catch (e) {}
  return null;
}

const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>紅蓮 Player</title>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
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
  .menu-panel{ display:none; }
  .menu-panel.active{ display:block; }

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
      <span id="animeTitle">紅蓮 Player</span>
    </div>

    <div class="center-play" id="centerPlay">
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    </div>

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

  if(cfg.title){document.getElementById("animeTitle").textContent=cfg.title;document.title=cfg.title}

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
    if(!cfg.tracks||cfg.tracks.length===0)return;
    var hasSub=false;
    cfg.tracks.forEach(function(trk,i){
      if(trk.kind!=="captions"&&trk.kind!=="subtitles")return;
      hasSub=true;
      var el=document.createElement("track");el.kind=trk.kind;el.src=trk.file;el.label=trk.label||"Sub "+(i+1);el.srclang=trk.label?trk.label.substring(0,2).toLowerCase():"en";if(trk.default)el.default=true;video.appendChild(el);
    });
    if(hasSub){subVal.textContent="1 Track"}
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
  });
  video.addEventListener('loadedmetadata',function(){
    durTime.textContent=fmt(video.duration);
  });
  seek.addEventListener('input',function(){
    if(isFinite(video.duration)){
      video.currentTime=(seek.value/100)*video.duration;
    }
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

  document.addEventListener('keydown',function(e){
    if(e.code==='Space'){e.preventDefault();togglePlay()}
    if(e.code==='ArrowRight'){video.currentTime+=5}
    if(e.code==='ArrowLeft'){video.currentTime-=5}
    if(e.code==='ArrowUp'){e.preventDefault();volume.value=Math.min(100,+volume.value+5);volume.dispatchEvent(new Event('input'))}
    if(e.code==='ArrowDown'){e.preventDefault();volume.value=Math.max(0,+volume.value-5);volume.dispatchEvent(new Event('input'))}
    if(e.key==='f'||e.key==='F'){fullBtn.click()}
    if(e.key==='m'||e.key==='M'){muteBtn.click()}
  });

  if(src&&src.length>0){
    if(src.includes('.m3u8')){
      if(Hls.isSupported()){
        hls=new Hls({maxBufferLength:30,maxMaxBufferLength:60});
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
        hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){setTag('Stream error')}})
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

  document.querySelectorAll('#panelSub .option-row').forEach(function(row){
    row.addEventListener('click',function(){
      var idx=parseInt(row.getAttribute('data-sub'),10);
      for(var i=0;i<video.textTracks.length;i++){video.textTracks[i].mode=idx===i?'showing':'hidden'}
      subVal.textContent=idx===-1?'Off':(row.querySelector('span').textContent||'Track '+(idx+1));
      document.querySelectorAll('#panelSub .option-row').forEach(function(r){r.classList.remove('selected')});row.classList.add('selected');closeMenu()
    })
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

function rewriteM3u8(body, baseUrl, serverHost, hParam) {
  var lines = body.split("\n");
  var baseDir = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith(serverHost)) continue;
    if (line.startsWith("http://") || line.startsWith("https://")) {
      lines[li] = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(line) + hParam;
    } else {
      var absUrl = baseDir + line;
      lines[li] = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(absUrl) + hParam;
    }
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

      // Fetch AniList info and run anikage in PARALLEL (anikage doesn't need malId)
      var aniInfoPromise = (function() {
        var cacheKey = "al-" + anilistId;
        var cached = getScrapeCache(cacheKey);
        if (cached) return Promise.resolve(cached);
        return fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" }, body: JSON.stringify({ query: "{ Media(id:" + anilistId + ",type:ANIME){ idMal title{romaji english native} } }" }) }).then(function(r) { return r.json(); }).then(function(gd) { var gm = gd.data && gd.data.Media; if (gm) { var info = { malId: gm.idMal, title: gm.title && (gm.title.english || gm.title.romaji || gm.title.native) || "" }; cacheScrape(cacheKey, info); return info; } return { malId: null, title: "" }; }).catch(function() { return { malId: null, title: "" }; });
      })();

      var akPromise = scrapeAnikage(anilistId, episode).catch(function() { return {}; });

      var aniInfo = await aniInfoPromise;
      var malId = aniInfo.malId;
      var animeTitle = aniInfo.title;
      // Fallback: if AniList returned empty title, try to get from anikage response
      if (!animeTitle) {
        try { var akTemp = await akPromise; if (akTemp && akTemp.title) animeTitle = akTemp.title; } catch (e) {}
      }
      var result = { success: true, anilistId: anilistId, malId: malId, ep: episode, title: animeTitle, sources: [], downloads: null };

      // Wait for anikage to finish
      var akSources = await akPromise;

      // Run megaplay + downloads in parallel (need malId, but scrapeAnikage already done)
      var mpPromise = malId ? scrapeBoth(malId, episode).catch(function() { return {}; }) : Promise.resolve({});
      var dlPromise = malId ? getDownloadLinksCached(malId, episode) : Promise.resolve(null);

      var mpDlResults = await Promise.all([mpPromise, dlPromise]);
      var sources = mpDlResults[0];
      result.downloads = mpDlResults[1];

      // Process megaplay results
      if (sources && typeof sources === "object") {
        var langKeys = ["sub", "dub"];
        for (var li = 0; li < langKeys.length; li++) {
          var lang = langKeys[li];
          if (sources[lang]) {
            var s = sources[lang];
            result.sources.push({ source: "megaplay", type: lang, m3u8: null, tracks: null, intro: s.intro || null, outro: s.outro || null, label: animeTitle + " " + lang.toUpperCase() + " (MegaPlay)", embedUrl: "" });
          }
        }
      }

      // Process anikage results
      if (akSources && typeof akSources === "object") {
        var serverNames = ["neko", "koto"];
        for (var si = 0; si < serverNames.length; si++) {
          var srv = akSources[serverNames[si]];
          if (!srv) continue;
          var langKeys2 = ["sub", "dub"];
          for (var li2 = 0; li2 < langKeys2.length; li2++) {
            var lang2 = langKeys2[li2];
            if (srv[lang2]) {
              var s2 = srv[lang2];
              result.sources.push({ source: "anikage", server: serverNames[si], type: lang2, quality: s2.quality, m3u8: null, tracks: null, intro: s2.intro || null, outro: s2.outro || null, label: animeTitle + " " + lang2.toUpperCase() + " (" + serverNames[si] + ")", embedUrl: "" });
            }
          }
        }
      }

      return new Response(JSON.stringify(result), { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }) });
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
      var ANI_HEADERS = encodeURIComponent(JSON.stringify({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Referer": "https://anikage.cc/", "Origin": "https://anikage.cc", "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9" }));
      function wrapAni(url) { return "https://megacloud.animanga.fun/proxy?url=" + encodeURIComponent(url) + "&headers=" + ANI_HEADERS; }
      aConfig.m3u8 = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wrapAni(aConfig.m3u8));
      if (aConfig.tracks) { aConfig.tracks = aConfig.tracks.map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wrapAni(t.file)) }); }); }
      var playerPageA = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(aConfig) + ";</script></head>");
      return new Response(playerPageA, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    if (url === "/api/proxy/m3u8") {
      var targetUrl = reqUrl.searchParams.get("url");
      if (!targetUrl) return new Response("Missing url param", { status: 400 });
      var customHeaders = reqUrl.searchParams.get("headers");
      var fetchHeaders = Object.assign({}, CDN_HEADERS);
      if (customHeaders) {
        try { var parsed = JSON.parse(customHeaders); Object.assign(fetchHeaders, parsed); } catch {}
      }

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
      var wMalId = null, wTitle = "";
      // Check AniList cache
      var wInfoCached = getScrapeCache("al-" + wAnilistId);
      if (wInfoCached) { wMalId = wInfoCached.malId; wTitle = wInfoCached.title; }
      if (!wMalId) {
        try {
          var wGql = JSON.stringify({ query: "{ Media(id:" + wAnilistId + ",type:ANIME){ idMal title{romaji english} } }" });
          var wGr = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" }, body: wGql });
          var wGd = await wGr.json();
          var wGm = wGd.data && wGd.data.Media;
          if (wGm) { wMalId = wGm.idMal; wTitle = (wGm.title && (wGm.title.english || wGm.title.romaji)) || ""; cacheScrape("al-" + wAnilistId, { malId: wMalId, title: wTitle }); }
        } catch {}
      }
      if (!wMalId) return new Response("MAL ID not found for anilist " + wAnilistId, { status: 404, headers: corsHeaders });
      // Use cache if available (anime-embed likely already scraped)
      var wCacheKey = "mp-" + wMalId + "-" + wEpisode;
      var wSources = getScrapeCache(wCacheKey) || await scrapeBoth(wMalId, wEpisode);
      var wData = wSources[wLang];
      if (!wData) return new Response(wLang.toUpperCase() + " not available for ep " + wEpisode, { status: 404, headers: corsHeaders });
      var wCfg = { m3u8: wData.m3u8, tracks: wData.tracks || [], intro: wData.intro || null, outro: wData.outro || null, title: wTitle + " - Ep " + wEpisode };
      wCfg.m3u8 = serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wCfg.m3u8) + "&headers=" + encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" }));
      if (wCfg.tracks) { wCfg.tracks = wCfg.tracks.map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) + "&headers=" + encodeURIComponent(JSON.stringify({ "Referer": "https://megaplay.buzz/" })) }); }); }
      var wPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg) + ";</script></head>");
      return new Response(wPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
    }

    function serveAnikageServer(aniId, ep, lang, serverName) {
      return async function() {
        var wTitle = "";
        var wInfo = getScrapeCache("al-" + aniId);
        if (wInfo) { wTitle = wInfo.title; }
        if (!wTitle) {
          try {
            var wGql = JSON.stringify({ query: "{ Media(id:" + aniId + ",type:ANIME){ title{romaji english} } }" });
            var wGr = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" }, body: wGql });
            var wGd = await wGr.json();
            var wGm = wGd.data && wGd.data.Media;
            if (wGm) { wTitle = (wGm.title && (wGm.title.english || wGm.title.romaji)) || ""; cacheScrape("al-" + aniId, { malId: null, title: wTitle }); }
          } catch {}
        }
        var wCacheKey = "ak-" + aniId + "-" + ep;
        var wSources = getScrapeCache(wCacheKey) || await scrapeAnikage(aniId, ep);
        var wData = wSources[serverName] && wSources[serverName][lang];
        if (!wData) return new Response(lang.toUpperCase() + " not available on " + serverName + " for ep " + ep, { status: 404, headers: corsHeaders });
        var wCfg = { m3u8: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wData.m3u8), tracks: (wData.tracks || []).map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) }); }), intro: wData.intro || null, outro: wData.outro || null, title: wTitle + " - Ep " + ep };
        var wPage = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg) + ";</script></head>");
        return new Response(wPage, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
      };
    }

    var watchNekoMatch = url.match(/^\/api\/watch\/neko\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchNekoMatch) return await serveAnikageServer(Number(watchNekoMatch[1]), Number(watchNekoMatch[2]), watchNekoMatch[3], "neko")();

    var watchKotoMatch = url.match(/^\/api\/watch\/koto\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchKotoMatch) return await serveAnikageServer(Number(watchKotoMatch[1]), Number(watchKotoMatch[2]), watchKotoMatch[3], "koto")();

    var watchAkMatch = url.match(/^\/api\/watch\/ak\/(\d+)\/(\d+)\/(sub|dub)$/);
    if (watchAkMatch) {
      var wAnilistId2 = Number(watchAkMatch[1]);
      var wEpisode2 = Number(watchAkMatch[2]);
      var wLang2 = watchAkMatch[3];
      var wTitle2 = "";
      var wInfoCached2 = getScrapeCache("al-" + wAnilistId2);
      if (wInfoCached2) { wTitle2 = wInfoCached2.title; }
      if (!wTitle2) {
        try {
          var wGql2 = JSON.stringify({ query: "{ Media(id:" + wAnilistId2 + ",type:ANIME){ title{romaji english} } }" });
          var wGr2 = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA, "Accept": "application/json" }, body: wGql2 });
          var wGd2 = await wGr2.json();
          var wGm2 = wGd2.data && wGd2.data.Media;
          if (wGm2) { wTitle2 = (wGm2.title && (wGm2.title.english || wGm2.title.romaji)) || ""; cacheScrape("al-" + wAnilistId2, { malId: null, title: wTitle2 }); }
        } catch {}
      }
      var wAkCacheKey = "ak-" + wAnilistId2 + "-" + wEpisode2;
      var wAkSources = getScrapeCache(wAkCacheKey) || await scrapeAnikage(wAnilistId2, wEpisode2);
      var wAkData = null, wServerName = "";
      var targetServers = ["neko", "koto"];
      for (var si = 0; si < targetServers.length; si++) {
        var srv = wAkSources[targetServers[si]];
        if (srv && srv[wLang2]) { wAkData = srv[wLang2]; wServerName = targetServers[si]; break; }
      }
      if (!wAkData) return new Response(wLang2.toUpperCase() + " not available for ep " + wEpisode2, { status: 404, headers: corsHeaders });
      var wCfg2 = { m3u8: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(wAkData.m3u8), tracks: (wAkData.tracks || []).map(function(t) { return Object.assign({}, t, { file: serverHost + "/api/proxy/m3u8?url=" + encodeURIComponent(t.file) }); }), intro: wAkData.intro || null, outro: wAkData.outro || null, title: wTitle2 + " - Ep " + wEpisode2 };
      var wPage2 = PLAYER_HTML.replace("</head>", '<script>window.__PLAYER_CONFIG__=' + JSON.stringify(wCfg2) + ";</script></head>");
      return new Response(wPage2, { status: 200, headers: Object.assign({}, corsHeaders, { "Content-Type": "text/html; charset=utf-8" }) });
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