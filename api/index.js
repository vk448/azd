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

function detectLangCode(label) {
  const l = String(label).toLowerCase();
  if (/english|eng|en[\s_-]/i.test(l)) return "en";
  if (/japanese|jpn|jp|jap/i.test(l)) return "ja";
  if (/spanish|esp|spa/i.test(l)) return "es";
  if (/portuguese|por|pt/i.test(l)) return "pt";
  if (/french|fra|fre|fr/i.test(l)) return "fr";
  if (/german|deu|ger|de/i.test(l)) return "de";
  if (/arabic|ara|ar/i.test(l)) return "ar";
  if (/hindi|hin|hi/i.test(l)) return "hi";
  if (/russian|rus|ru/i.test(l)) return "ru";
  if (/indonesian|ind|id/i.test(l)) return "id";
  if (/malay|msa|ms/i.test(l)) return "ms";
  if (/turkish|tur|tr/i.test(l)) return "tr";
  if (/italian|ita|it/i.test(l)) return "it";
  if (/korean|kor|ko/i.test(l)) return "ko";
  if (/thai|tha|th/i.test(l)) return "th";
  if (/vietnamese|vie|vi/i.test(l)) return "vi";
  if (/chinese|zho|zh/i.test(l)) return "zh";
  if (/polish|pol|pl/i.test(l)) return "pl";
  if (/dutch|nld|nl/i.test(l)) return "nl";
  return "en";
}

function stableHash(...parts) {
  let h = 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
  }
  return (h >>> 0).toString(36);
}

function encodeHash(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function decodeHash(hash) {
  try {
    return JSON.parse(Buffer.from(hash, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

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

let TVDB_TOKEN=null,TVDB_TOKEN_TIME=0;
async function getTvdbToken(){if(TVDB_TOKEN&&Date.now()-TVDB_TOKEN_TIME<3600000)return TVDB_TOKEN;try{const r=await fetch('https://api4.thetvdb.com/v4/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apikey:'6f5b30cc-a5ec-4c3a-bed2-ab3a665efe29'})});if(!r.ok)return null;const d=await r.json();TVDB_TOKEN=d.data?.token;TVDB_TOKEN_TIME=Date.now();return TVDB_TOKEN}catch{return null}}
async function getCoverImage(title){
  const clean=title.replace(/[-\s]*EP\d+/i,'').replace(/ *\([^)]*\) */g,'').trim();
  try{
    const token=await getTvdbToken();
    if(token){
      const sr=await fetch('https://api4.thetvdb.com/v4/search/series?name='+encodeURIComponent(clean),{headers:{'Authorization':'Bearer '+token}});
      if(sr.ok){const sd=await sr.json();if(sd.data&&sd.data.length){
        const seriesId=sd.data[0].id;
        const ar=await fetch('https://api4.thetvdb.com/v4/series/'+seriesId+'/images/query?keyType=poster',  {headers:{'Authorization':'Bearer '+token}});
        if(ar.ok){const ad=await ar.json();if(ad.data?.filename)return 'https://artworks.thetvdb.com/banners/'+ad.data.filename}
        const ar2=await fetch('https://api4.thetvdb.com/v4/series/'+seriesId+'/images/query?keyType=wide',  {headers:{'Authorization':'Bearer '+token}});
        if(ar2.ok){const ad2=await ar2.json();if(ad2.data?.filename)return 'https://artworks.thetvdb.com/banners/'+ad2.data.filename}
      }}
    }
  }catch{}
  try{
    const key='f9f48907795cdf0930e1634d100b7a50';
    const q=encodeURIComponent(clean);
    const r=await fetch('https://api.themoviedb.org/3/search/tv?api_key='+key+'&query='+q,{headers:{'User-Agent':UA}});
    if(r.ok){const d=await r.json();if(d.results?.[0]?.backdrop_path)return 'https://image.tmdb.org/t/p/original'+d.results[0].backdrop_path;if(d.results?.[0]?.poster_path)return 'https://image.tmdb.org/t/p/original'+d.results[0].poster_path}
  }catch{}
  return null
}

function makeBtn(url, type, label, sub) {
  const icon = type === "sub" ? "closed-captioning" : "microphone";
  if (url) return `<a href="${url}" target="_blank" class="dl-btn ${type}"><div class="dl-icon"><i class="fas fa-${icon}"></i></div><div class="dl-info"><span class="main-text">Download ${label}</span><span class="sub-text">${sub}</span></div><i class="fas fa-chevron-right dl-arrow"></i></a>`;
  return `<div class="dl-btn ${type} disabled"><div class="dl-icon"><i class="fas fa-${icon}"></i></div><div class="dl-info"><span class="main-text">${label} Unavailable</span><span class="sub-text">Not available yet</span></div></div>`;
}

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

function renderError(msg) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AnimeZilla - Error</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
${SHARED_BG}
.animated-bg{position:fixed;inset:0;z-index:0;background:linear-gradient(135deg,#0a0808 0%,#1a0808 30%,#0d0a08 60%,#0a0808 100%);overflow:hidden}
.animated-bg::before{content:'';position:absolute;width:600px;height:600px;background:radial-gradient(circle,rgba(255,60,47,0.07) 0%,transparent 70%);top:-200px;right:-200px;animation:float 8s ease-in-out infinite}
.animated-bg::after{content:'';position:absolute;width:500px;height:500px;background:radial-gradient(circle,rgba(255,170,0,0.05) 0%,transparent 70%);bottom:-150px;left:-150px;animation:float 10s ease-in-out infinite reverse}
@keyframes float{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-30px)}}
.cpage{position:relative;z-index:10;text-align:center;padding:40px 24px;max-width:420px;width:100%}
.clogo{display:inline-flex;align-items:center;gap:10px;margin-bottom:40px;text-decoration:none}
.clogo .logo-icon{width:48px;height:48px}
.clogo .logo-text{font-size:28px}
.ecard{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);border-radius:24px;padding:48px 32px;backdrop-filter:blur(20px);animation:slideUp .6s ease-out}
@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.eicon{width:80px;height:80px;margin:0 auto 24px;border-radius:50%;background:linear-gradient(135deg,rgba(255,60,47,0.15),rgba(255,170,0,0.05));border:2px solid rgba(255,60,47,0.2);display:flex;align-items:center;justify-content:center;font-size:36px;color:#ff3c2f;animation:scaleIn .4s ease-out .2s both}
@keyframes scaleIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}
.etitle{font-size:22px;font-weight:800;margin-bottom:10px;color:#fff}
.emsg{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:28px}
.ehint{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(255,60,47,0.1),rgba(255,170,0,0.05));border:1px solid rgba(255,60,47,0.2);border-radius:12px;padding:12px 20px;font-size:13px;color:#ff6b35;font-weight:600;text-decoration:none;transition:all .3s}
.ehint:hover{background:rgba(255,60,47,0.2);border-color:rgba(255,170,0,0.35);transform:translateY(-2px)}
</style></head><body>
<div class="animated-bg"></div>
<div class="cpage">
<div class="clogo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></div>
<div class="ecard">
<div class="eicon"><i class="fas fa-exclamation-triangle"></i></div>
<h1 class="etitle">Oops! Something went wrong</h1>
<p class="emsg">${msg}</p>
<a href="https://animezilla.vercel.app" class="ehint"><i class="fas fa-arrow-left"></i> Back to Website</a>
</div>
</div>
</body></html>`;
}

function renderUnavailable(name, ep, img) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${name} - Download Unavailable | AnimeZilla</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
${SHARED_BG}
.card{position:relative;z-index:10;text-align:center;padding:48px 36px;max-width:400px;width:100%;margin:auto;animation:slideUp .6s ease-out}
@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.poster-wrap{position:relative;margin-bottom:28px;display:inline-block}
.poster-glow{position:absolute;inset:-20px;background:radial-gradient(circle,rgba(255,60,47,0.2) 0%,rgba(255,170,0,0.08) 50%,transparent 70%);z-index:-1;filter:blur(30px);animation:glow 4s ease-in-out infinite alternate}
@keyframes glow{from{opacity:0.5;transform:scale(0.95)}to{opacity:1;transform:scale(1.05)}}
.poster{width:185px;height:262px;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(255,60,47,0.2),0 0 0 1px rgba(255,255,255,0.06),0 0 80px rgba(255,100,0,0.1);position:relative}
.poster img{width:100%;height:100%;object-fit:cover;filter:brightness(0.55) saturate(0.7)}
.poster-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.85) 100%);display:flex;align-items:center;justify-content:center}
.unavailable-badge{background:linear-gradient(135deg,#ff3c2f,#ff6b35);color:#fff;font-size:11px;font-weight:800;padding:7px 16px;border-radius:8px;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 4px 20px rgba(255,60,47,0.5)}
.title{font-size:24px;font-weight:800;margin-bottom:6px;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,0.6)}
.ep-text{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:24px}
.umsg{display:flex;align-items:center;gap:10px;background:rgba(255,60,47,0.06);border:1px solid rgba(255,60,47,0.12);border-radius:14px;padding:16px 20px;margin-bottom:28px;animation:fadeIn .5s ease-out .2s both}
.umsg i{font-size:20px;color:#ff3c2f;flex-shrink:0}
.umsg .mt{font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);text-align:left;line-height:1.4}
.umsg .ms{font-size:12px;color:rgba(255,255,255,0.3);font-weight:400;margin-top:2px}
.back-btn{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 50%,#ffaa00 100%);color:#fff;border:none;border-radius:14px;padding:16px 32px;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;transition:all .35s cubic-bezier(.4,0,.2,1);box-shadow:0 8px 30px rgba(255,60,47,0.3);animation:fadeIn .5s ease-out .3s both}
.back-btn:hover{transform:translateY(-3px);box-shadow:0 14px 40px rgba(255,100,0,0.5)}
.back-btn i{font-size:14px;transition:transform .3s}
.back-btn:hover i{transform:translateX(-3px)}
</style></head><body>
<div class="bg-layer"><img src="${img}" alt=""></div>
<div class="bg-overlay"></div>
<div class="card">
<div class="poster-wrap"><div class="poster-glow"></div><div class="poster"><img src="${img}" alt="${name}"><div class="poster-overlay"><span class="unavailable-badge">Unavailable</span></div></div></div>
<h1 class="title">${name}</h1>
<p class="ep-text">Episode ${ep}</p>
<div class="umsg"><i class="fas fa-exclamation-circle"></i><div><div class="mt">Download Unavailable</div><div class="ms">This episode is not available yet. Check back later.</div></div></div>
<a href="https://animezilla.vercel.app" class="back-btn"><i class="fas fa-arrow-left"></i> Back to Website</a>
</div>
</body></html>`;
}

function renderPage(name, ep, img, subUrl, dubUrl) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${name} Episode ${ep} - AnimeZilla</title>
<meta name="description" content="Download ${name} Episode ${ep} in SUB and DUB quality">
<meta property="og:title" content="${name} Episode ${ep} - AnimeZilla">
<meta property="og:description" content="Download ${name} Episode ${ep}">
<meta property="og:image" content="${img}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
${SHARED_BG}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px 40px;max-width:480px;margin:0 auto;width:100%}
.poster-wrap{position:relative;margin-bottom:32px;animation:su .6s ease-out}
.poster-glow{position:absolute;inset:-30px;background:radial-gradient(circle,rgba(255,60,47,0.25) 0%,rgba(255,170,0,0.1) 40%,transparent 70%);z-index:-1;filter:blur(30px);animation:glow 4s ease-in-out infinite alternate}
@keyframes glow{from{opacity:0.6;transform:scale(0.95)}to{opacity:1;transform:scale(1.05)}}
.poster{width:200px;height:284px;border-radius:22px;overflow:hidden;box-shadow:0 35px 90px rgba(255,60,47,0.25),0 0 0 1px rgba(255,255,255,0.08),0 0 80px rgba(255,100,0,0.12),0 0 120px rgba(255,60,47,0.08);transition:all .4s cubic-bezier(.4,0,.2,1)}
.poster:hover{transform:translateY(-8px) scale(1.02);box-shadow:0 45px 100px rgba(255,60,47,0.3),0 0 0 1px rgba(255,255,255,0.1),0 0 100px rgba(255,100,0,0.15)}
.poster img{width:100%;height:100%;object-fit:cover;transition:transform .5s}
.poster:hover img{transform:scale(1.08)}
.ep-badge{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(255,60,47,0.2),rgba(255,170,0,0.1));border:1px solid rgba(255,60,47,0.3);color:#ffb088;font-size:12px;font-weight:700;padding:8px 18px;border-radius:30px;margin-bottom:18px;backdrop-filter:blur(12px);animation:su .5s ease-out .1s both;letter-spacing:0.5px}
.title{font-size:28px;font-weight:800;text-align:center;line-height:1.2;margin-bottom:8px;background:linear-gradient(135deg,#fff 0%,#ffccaa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 4px 20px rgba(0,0,0,0.5));animation:su .5s ease-out .15s both}
.meta{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:40px;display:flex;align-items:center;gap:14px;animation:su .5s ease-out .2s both}
.meta span{display:flex;align-items:center;gap:6px}
.dot{width:3px;height:3px;background:rgba(255,170,0,0.4);border-radius:50%}
.dl-section{width:100%;animation:su .5s ease-out .25s both}
.dl-label{font-size:11px;font-weight:700;color:rgba(255,170,0,0.5);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;padding-left:4px}
.dl-btn{display:flex;align-items:center;gap:14px;width:100%;padding:20px 24px;border-radius:18px;font-size:15px;font-weight:700;text-decoration:none;transition:all .35s cubic-bezier(.4,0,.2,1);margin-bottom:14px;position:relative;overflow:hidden}
.dl-btn:active{transform:scale(0.97)}
.dl-btn.sub{background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 50%,#ffaa00 100%);color:#fff;box-shadow:0 10px 40px rgba(255,60,47,0.35),inset 0 1px 0 rgba(255,255,255,0.2)}
.dl-btn.sub:hover{transform:translateY(-4px);box-shadow:0 16px 50px rgba(255,100,0,0.5),inset 0 1px 0 rgba(255,255,255,0.25)}
.dl-btn.sub::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.15),transparent);opacity:0;transition:opacity .3s}
.dl-btn.sub:hover::before{opacity:1}
.dl-btn.dub{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px)}
.dl-btn.dub:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,170,0,0.2);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.3)}
.dl-btn.disabled{opacity:0.3;cursor:not-allowed;pointer-events:none}
.dl-icon{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.sub .dl-icon{background:rgba(255,255,255,0.2)}
.dub .dl-icon{background:rgba(255,255,255,0.06)}
.dl-info{flex:1}
.dl-info .main-text{display:block;font-size:15px;font-weight:700}
.dl-info .sub-text{display:block;font-size:12px;font-weight:500;opacity:0.55;margin-top:3px}
.dl-arrow{font-size:16px;opacity:0.35;transition:all .3s}
.dl-btn:hover .dl-arrow{transform:translateX(5px);opacity:0.8}
@media(max-width:480px){.title{font-size:22px}.poster{width:170px;height:240px}.dl-btn{padding:18px 20px}}
</style></head><body>
<div class="bg-layer"><img src="${img}" alt=""></div>
<div class="bg-overlay"></div>
<div class="page">
<div class="header"><a href="https://animezilla.vercel.app" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a></div>
<div class="main">
<div class="poster-wrap"><div class="poster-glow"></div><div class="poster"><img src="${img}" alt="${name}"></div></div>
<div class="ep-badge"><i class="fas fa-play-circle"></i> Episode ${ep}</div>
<h1 class="title">${name}</h1>
<div class="meta"><span><i class="fas fa-tv"></i> Episode ${ep}</span><div class="dot"></div><span><i class="fas fa-signal"></i> 1080p</span><div class="dot"></div><span><i class="fas fa-closed-captioning"></i> Sub/Dub</span></div>
<div class="dl-section"><div class="dl-label">Download</div>${makeBtn(subUrl, "sub", "SUB", "Subtitle (Default)")}${makeBtn(dubUrl, "dub", "DUB", "English Dubbed (Default)")}</div>
</div>
<div class="footer"><p>Powered by <a href="https://animezilla.vercel.app">AnimeZilla</a></p></div>
</div>
</body></html>`;
}

function renderWatch(name, season, ep, embedUrl, img) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Watch ${name} S${season}E${ep} - AnimeZilla</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0a0808;color:#fff;min-height:100vh;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:rgba(0,0,0,0.6);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05);position:sticky;top:0;z-index:100}
.topbar-left{display:flex;align-items:center;gap:12px}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none}
.logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#ff3c2f,#ff6b35,#ffaa00);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 12px rgba(255,60,47,0.3)}
.logo-text{font-size:18px;font-weight:900;background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 40%,#ffaa00 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ep-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,rgba(255,60,47,0.2),rgba(255,170,0,0.1));border:1px solid rgba(255,60,47,0.3);color:#ffb088;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;backdrop-filter:blur(8px)}
.topbar-right{display:flex;align-items:center;gap:10px}
.nav-btn{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;transition:all .3s;cursor:pointer}
.nav-btn:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,170,0,0.2);transform:translateY(-1px)}
.nav-btn.primary{background:linear-gradient(135deg,#ff3c2f,#ff6b35);border:none;box-shadow:0 4px 15px rgba(255,60,47,0.3)}
.nav-btn.primary:hover{box-shadow:0 6px 20px rgba(255,100,0,0.4);transform:translateY(-1px)}
.nav-btn.disabled{opacity:0.3;pointer-events:none}
.player-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;aspect-ratio:16/9;max-height:calc(100vh - 60px)}
.player-wrap iframe{width:100%;height:100%;border:none}
.info-bar{padding:16px 20px;background:rgba(0,0,0,0.4);border-top:1px solid rgba(255,255,255,0.05)}
.info-title{font-size:18px;font-weight:700;margin-bottom:4px}
.info-meta{font-size:13px;color:rgba(255,255,255,0.4);display:flex;align-items:center;gap:12px}
.info-meta span{display:flex;align-items:center;gap:6px}
.dot{width:4px;height:4px;background:rgba(255,170,0,0.4);border-radius:50%}
.season-nav{display:flex;gap:8px;padding:16px 20px;overflow-x:auto;background:rgba(0,0,0,0.3)}
.season-btn{flex-shrink:0;padding:10px 20px;border-radius:12px;font-size:13px;font-weight:700;text-decoration:none;transition:all .3s;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6)}
.season-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
.season-btn.active{background:linear-gradient(135deg,#ff3c2f,#ff6b35);border:none;color:#fff;box-shadow:0 4px 15px rgba(255,60,47,0.3)}
.ep-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:8px;padding:16px 20px;max-height:200px;overflow-y:auto}
.ep-btn{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;transition:all .3s;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.5)}
.ep-btn:hover{background:rgba(255,255,255,0.08);color:#fff;transform:scale(1.05)}
.ep-btn.active{background:linear-gradient(135deg,#ff3c2f,#ff6b35);border:none;color:#fff;box-shadow:0 2px 10px rgba(255,60,47,0.3)}
.ep-btn.current{border-color:#ff6b35;color:#ff6b35}
.footer{padding:20px;text-align:center;font-size:11px;color:rgba(255,255,255,0.15)}
.footer a{color:#ff6b35;text-decoration:none}
</style></head><body>
<div class="topbar">
<div class="topbar-left">
<a href="https://animezilla.vercel.app" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a>
<div class="ep-badge"><i class="fas fa-play-circle"></i> S${season} E${ep}</div>
</div>
<div class="topbar-right">
<button class="nav-btn" onclick="changeEp(-1)"><i class="fas fa-chevron-left"></i> Prev</button>
<button class="nav-btn primary" onclick="changeEp(1)">Next <i class="fas fa-chevron-right"></i></button>
</div>
</div>
<div class="player-wrap">
<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
</div>
<div class="info-bar">
<div class="info-title">${name}</div>
<div class="info-meta">
<span><i class="fas fa-layer-group"></i> Season ${season}</span>
<div class="dot"></div>
<span><i class="fas fa-play"></i> Episode ${ep}</span>
<div class="dot"></div>
<span><i class="fas fa-signal"></i> HD</span>
</div>
</div>
<div class="season-nav" id="seasonNav"></div>
<div class="ep-grid" id="epGrid"></div>
<div class="footer">Powered by <a href="https://animezilla.vercel.app">AnimeZilla</a> | Video from ToonStream</div>
<script>
var malId="${'' + (global._watchMid || 0)}";
var curSeason=${season};
var curEp=${ep};
var totalEps=${global._watchTotalEps || 25};
var maxSeason=${global._watchMaxSeason || season};

function buildUrl(s,e){return "/api/watch/"+malId+"/"+s+"/"+e}
function changeEp(d){var n=curEp+d;if(n<1){if(curSeason>1){window.location=buildUrl(curSeason-1,totalEps)}return}if(n>totalEps){if(curSeason<maxSeason){window.location=buildUrl(curSeason+1,1)}return}window.location=buildUrl(curSeason,n)}

// Build season nav
var sn=document.getElementById("seasonNav");
for(var s=1;s<=maxSeason;s++){
var a=document.createElement("a");
a.className="season-btn"+(s===curSeason?" active":"");
a.href=buildUrl(s,1);
a.textContent="Season "+s;
sn.appendChild(a);
}

// Build ep grid
var eg=document.getElementById("epGrid");
for(var e=1;e<=totalEps;e++){
var a=document.createElement("a");
a.className="ep-btn"+(e===curEp?" current":"");
a.href=buildUrl(curSeason,e);
a.textContent=e;
eg.appendChild(a);
}
</script>
</body></html>`;
}

function renderEmbed(embedUrl) {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body,iframe{width:100%;height:100%;border:none;background:#000}</style>
</head><body>
<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
</body></html>`;
}

function renderPlayer(name, season, ep, m3u8Url, img, subUrl, dubUrl) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Play ${name} S${season}E${ep} - AnimeZilla</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#fff;min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#0f0f0f;border-bottom:1px solid rgba(255,255,255,0.08);position:relative;z-index:100}
.topbar-left{display:flex;align-items:center;gap:10px}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none}
.logo-icon{width:30px;height:30px;background:linear-gradient(135deg,#ff3c2f,#ff6b35,#ffaa00);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 10px rgba(255,60,47,0.3)}
.logo-text{font-size:16px;font-weight:900;background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 40%,#ffaa00 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar-right{display:flex;align-items:center;gap:8px}
.nav-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.08);border:none;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
.nav-btn:hover{background:rgba(255,255,255,0.15)}
.nav-btn.primary{background:linear-gradient(135deg,#ff3c2f,#ff6b35);box-shadow:0 2px 8px rgba(255,60,47,0.3)}

.player-container{position:relative;background:#000;width:100%;aspect-ratio:16/9;max-height:70vh;cursor:pointer}
.player-container video{width:100%;height:100%;object-fit:contain;background:#000}
.player-container.hide-cursor{cursor:none}

/* Loading */
.loading-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);z-index:20;pointer-events:none}
.spinner{width:48px;height:48px;border:3px solid rgba(255,255,255,0.1);border-top-color:#ff6b35;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-overlay.hidden{display:none}

/* Error */
.error-overlay{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);z-index:20}
.error-overlay i{font-size:48px;color:#ff3c2f;margin-bottom:16px}
.error-overlay p{font-size:15px;color:rgba(255,255,255,0.6)}
.error-overlay.visible{display:flex}

/* Center Play Button */
.center-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:68px;background:rgba(0,0,0,0.6);border:3px solid rgba(255,255,255,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:15;transition:all .2s;opacity:0;pointer-events:none}
.center-play i{font-size:28px;color:#fff;margin-left:4px}
.center-play.visible{opacity:1;pointer-events:auto}
.center-play:hover{transform:translate(-50%,-50%) scale(1.1);border-color:#ff6b35}

/* Controls Bar */
.controls{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.85));padding:30px 12px 10px;z-index:25;transition:opacity .3s}
.controls.hidden{opacity:0;pointer-events:none}

/* Progress Bar */
.progress-wrap{position:relative;width:100%;height:4px;margin-bottom:8px;cursor:pointer}
.progress-wrap:hover{height:6px}
.progress-bg{position:absolute;inset:0;background:rgba(255,255,255,0.2);border-radius:3px}
.progress-buffered{position:absolute;top:0;left:0;height:100%;background:rgba(255,255,255,0.3);border-radius:3px}
.progress-played{position:absolute;top:0;left:0;height:100%;background:#ff3c2f;border-radius:3px}
.progress-thumb{position:absolute;top:50%;width:14px;height:14px;background:#ff3c2f;border-radius:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity .2s;box-shadow:0 0 6px rgba(255,60,47,0.5)}
.progress-wrap:hover .progress-thumb{opacity:1}
.progress-tooltip{position:absolute;top:-32px;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;pointer-events:none;display:none;white-space:nowrap}
.progress-wrap:hover .progress-tooltip{display:block}

/* Control Buttons */
.ctrl-row{display:flex;align-items:center;gap:6px}
.ctrl-btn{background:none;border:none;color:#fff;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;font-size:16px;transition:background .2s;flex-shrink:0}
.ctrl-btn:hover{background:rgba(255,255,255,0.15)}
.ctrl-btn.big{font-size:22px}
.time-display{font-size:12px;color:rgba(255,255,255,0.8);font-weight:500;white-space:nowrap;padding:0 4px;user-select:none;font-variant-numeric:tabular-nums}
.spacer{flex:1}

/* Volume Slider */
.vol-wrap{display:flex;align-items:center;gap:4px}
.vol-slider{-webkit-appearance:none;width:0;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;outline:none;transition:width .2s;overflow:hidden}
.vol-wrap:hover .vol-slider{width:80px}
.vol-slider::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;background:#fff;border-radius:50%;cursor:pointer}

/* Speed Menu */
.speed-menu{position:absolute;bottom:50px;right:12px;background:rgba(28,28,28,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 0;z-index:30;display:none;min-width:140px;backdrop-filter:blur(20px)}
.speed-menu.visible{display:block}
.speed-opt{padding:8px 16px;font-size:13px;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .15s}
.speed-opt:hover{background:rgba(255,255,255,0.1)}
.speed-opt.active{color:#ff6b35;font-weight:700}

/* Quality Menu */
.quality-menu{position:absolute;bottom:50px;right:50px;background:rgba(28,28,28,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 0;z-index:30;display:none;min-width:140px;backdrop-filter:blur(20px)}
.quality-menu.visible{display:block}
.audio-menu{position:absolute;bottom:50px;right:90px;background:rgba(28,28,28,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 0;z-index:30;display:none;min-width:160px;backdrop-filter:blur(20px)}
.audio-menu.visible{display:block}
.audio-opt{padding:8px 16px;font-size:13px;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .15s}
.audio-opt:hover{background:rgba(255,255,255,0.1)}
.audio-opt.active{color:#ff6b35;font-weight:700}
.audio-opt .check{display:none;width:14px;text-align:center}
.audio-opt.active .check{display:inline}
.quality-opt{padding:8px 16px;font-size:13px;color:rgba(255,255,255,0.7);cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background .15s}
.quality-opt:hover{background:rgba(255,255,255,0.1)}
.quality-opt.active{color:#ff6b35;font-weight:700}

/* Info Bar */
.info-bar{padding:12px 16px;background:#0f0f0f;border-top:1px solid rgba(255,255,255,0.08)}
.info-title{font-size:16px;font-weight:700;margin-bottom:4px;line-height:1.3}
.info-meta{font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.info-meta span{display:flex;align-items:center;gap:5px}
.dot{width:3px;height:3px;background:rgba(255,255,255,0.2);border-radius:50%}

/* Episode Grid */
.ep-section{padding:16px;background:#0f0f0f}
.ep-section-title{font-size:13px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:12px;letter-spacing:1px;text-transform:uppercase}
.ep-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px}
.ep-btn{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;transition:all .15s;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6)}
.ep-btn:hover{background:rgba(255,255,255,0.12);color:#fff}
.ep-btn.active{background:#ff3c2f;border-color:#ff3c2f;color:#fff}
.info-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;gap:10px}
.info-title{font-size:15px;font-weight:700;color:#fff}
.info-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.5)}
.info-meta .dot{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.2)}
.dl-buttons{display:flex;gap:8px}
.dl-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;border:none;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.dl-btn.sub{background:linear-gradient(135deg,#ff3c2f,#ff6b35);color:#fff}
.dl-btn.sub:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,60,47,0.4)}
.dl-btn.dub{background:linear-gradient(135deg,#ffaa00,#ff8c00);color:#000}
.dl-btn.dub:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,170,0,0.4)}
.dl-btn i{font-size:12px}

@media(max-width:768px){.player-container{aspect-ratio:auto;height:56vw}.controls{padding:20px 8px 6px}.nav-btn span{display:none}.dl-btn{padding:6px 12px;font-size:11px}}
</style></head><body>
<div class="topbar">
<div class="topbar-left">
<a href="https://animezilla.vercel.app" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a>
</div>
<div class="topbar-right">
<button class="nav-btn" onclick="changeEp(-1)"><i class="fas fa-chevron-left"></i> <span>Prev</span></button>
<button class="nav-btn primary" onclick="changeEp(1)"><span>Next</span> <i class="fas fa-chevron-right"></i></button>
</div>
</div>

<div class="player-container" id="playerContainer">
<video id="video" playsinline preload="auto"></video>
<div class="loading-overlay" id="loading"><div class="spinner"></div></div>
<div class="error-overlay" id="error"><i class="fas fa-exclamation-triangle"></i><p>Failed to load stream</p></div>
<div class="center-play visible" id="centerPlay"><i class="fas fa-play"></i></div>

<div class="controls" id="controls">
<div class="progress-wrap" id="progressWrap">
<div class="progress-bg"></div>
<div class="progress-buffered" id="progressBuffered"></div>
<div class="progress-played" id="progressPlayed"></div>
<div class="progress-thumb" id="progressThumb"></div>
<div class="progress-tooltip" id="progressTooltip">0:00</div>
</div>
<div class="ctrl-row">
<button class="ctrl-btn big" id="playBtn"><i class="fas fa-play"></i></button>
<button class="ctrl-btn" id="prevBtn" title="Previous"><i class="fas fa-backward-step"></i></button>
<button class="ctrl-btn" id="nextBtn" title="Next"><i class="fas fa-forward-step"></i></button>
<div class="vol-wrap">
<button class="ctrl-btn" id="volBtn"><i class="fas fa-volume-high"></i></button>
<input type="range" class="vol-slider" id="volSlider" min="0" max="1" step="0.05" value="1">
</div>
<span class="time-display"><span id="curTime">0:00</span> / <span id="durTime">0:00</span></span>
<div class="spacer"></div>
<button class="ctrl-btn" id="audioBtn" title="Audio Track"><i class="fas fa-music"></i></button>
<button class="ctrl-btn" id="qualityBtn" title="Quality"><i class="fas fa-gear"></i></button>
<button class="ctrl-btn" id="speedBtn" title="Speed"><i class="fas fa-gauge-high"></i></button>
<button class="ctrl-btn" id="pipBtn" title="Picture in Picture"><i class="fas fa-window-restore"></i></button>
<button class="ctrl-btn big" id="fsBtn" title="Fullscreen"><i class="fas fa-expand"></i></button>
</div>
<div class="speed-menu" id="speedMenu">
<div class="speed-opt" data-speed="0.25">0.25x</div>
<div class="speed-opt" data-speed="0.5">0.5x</div>
<div class="speed-opt" data-speed="0.75">0.75x</div>
<div class="speed-opt active" data-speed="1">Normal</div>
<div class="speed-opt" data-speed="1.25">1.25x</div>
<div class="speed-opt" data-speed="1.5">1.5x</div>
<div class="speed-opt" data-speed="2">2x</div>
</div>
<div class="quality-menu" id="qualityMenu"></div>
<div class="audio-menu" id="audioMenu"></div>
</div>
</div>

<div class="info-bar">
<div class="info-title">${name} ÔÇö Season ${season}, Episode ${ep}</div>
<div class="dl-buttons">
<a href="${subUrl}" target="_blank" rel="noopener" class="dl-btn sub"><i class="fas fa-external-link-alt"></i> Source</a>
<button class="dl-btn dub" onclick="downloadVideo()"><i class="fas fa-download"></i> Download</button>
</div>
</div>

<div class="ep-section">
<div class="ep-section-title">Episodes</div>
<div class="ep-grid" id="epGrid"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
var m3u8="${m3u8Url ? "/api/proxy.m3u8?url=" + encodeURIComponent(m3u8Url) : ""}";
var malId="${'' + (global._playerMid || 0)}";
var curSeason=${season};
var curEp=${ep};
var maxSeason=${global._playerMaxSeason || season};
var totalEps=${global._playerTotalEps || 25};
var hls=null;
var video=document.getElementById("video");
var loading=document.getElementById("loading");
var errorDiv=document.getElementById("error");
var controls=document.getElementById("controls");
var playerContainer=document.getElementById("playerContainer");
var centerPlay=document.getElementById("centerPlay");
var playBtn=document.getElementById("playBtn");
var curTimeEl=document.getElementById("curTime");
var durTimeEl=document.getElementById("durTime");
var progressWrap=document.getElementById("progressWrap");
var progressPlayed=document.getElementById("progressPlayed");
var progressBuffered=document.getElementById("progressBuffered");
var progressThumb=document.getElementById("progressThumb");
var progressTooltip=document.getElementById("progressTooltip");
var volSlider=document.getElementById("volSlider");
var volBtn=document.getElementById("volBtn");
var qualityMenu=document.getElementById("qualityMenu");
var speedMenu=document.getElementById("speedMenu");
var audioMenu=document.getElementById("audioMenu");
var hideTimer=null;

function fmt(s){if(isNaN(s))return"0:00";var m=Math.floor(s/60);var sec=Math.floor(s%60);return m+":"+(sec<10?"0":"")+sec}

function showControls(){controls.classList.remove("hidden");playerContainer.classList.remove("hide-cursor");clearTimeout(hideTimer);if(!video.paused){hideTimer=setTimeout(function(){controls.classList.add("hidden");playerContainer.classList.add("hide-cursor")},3000)}}

function togglePlay(){if(video.paused){video.play()}else{video.pause()}}

function updatePlayBtn(){var icon=playBtn.querySelector("i");if(video.paused){icon.className="fas fa-play";centerPlay.classList.add("visible")}else{icon.className="fas fa-pause";centerPlay.classList.remove("visible")}}

function updateProgress(){if(video.duration){var pct=video.currentTime/video.duration*100;progressPlayed.style.width=pct+"%";progressThumb.style.left=pct+"%"}curTimeEl.textContent=fmt(video.currentTime)}
function updateBuffered(){if(video.buffered.length>0&&video.duration){var end=video.buffered.end(video.buffered.length-1);progressBuffered.style.width=end/video.duration*100+"%"}}

progressWrap.addEventListener("click",function(e){var rect=progressWrap.getBoundingClientRect();video.currentTime=(e.clientX-rect.left)/rect.width*video.duration});
progressWrap.addEventListener("mousemove",function(e){var rect=progressWrap.getBoundingClientRect();var pct=(e.clientX-rect.left)/rect.width;progressTooltip.textContent=fmt(pct*video.duration);progressTooltip.style.left=(e.clientX-rect.left)+"px"});
video.addEventListener("timeupdate",updateProgress);
video.addEventListener("progress",updateBuffered);
video.addEventListener("loadedmetadata",function(){durTimeEl.textContent=fmt(video.duration);loading.classList.add("hidden")});
video.addEventListener("waiting",function(){loading.classList.remove("hidden")});
video.addEventListener("canplay",function(){loading.classList.add("hidden")});
video.addEventListener("play",updatePlayBtn);
video.addEventListener("pause",updatePlayBtn);
video.addEventListener("ended",function(){changeEp(1)});

playerContainer.addEventListener("click",function(e){if(e.target===video||e.target===playerContainer)togglePlay()});
playerContainer.addEventListener("mousemove",showControls);
centerPlay.addEventListener("click",function(e){e.stopPropagation();togglePlay()});
playBtn.addEventListener("click",function(e){e.stopPropagation();togglePlay()});

document.getElementById("prevBtn").addEventListener("click",function(e){e.stopPropagation();changeEp(-1)});
document.getElementById("nextBtn").addEventListener("click",function(e){e.stopPropagation();changeEp(1)});

volSlider.addEventListener("input",function(e){e.stopPropagation();video.volume=this.value;updateVolIcon()});
volBtn.addEventListener("click",function(e){e.stopPropagation();video.muted=!video.muted;updateVolIcon()});
function updateVolIcon(){var i=volBtn.querySelector("i");if(video.muted||video.volume===0)i.className="fas fa-volume-xmark";else if(video.volume<0.5)i.className="fas fa-volume-low";else i.className="fas fa-volume-high"}

document.getElementById("fsBtn").addEventListener("click",function(e){e.stopPropagation();if(document.fullscreenElement){document.exitFullscreen()}else{playerContainer.requestFullscreen()}});
document.getElementById("pipBtn").addEventListener("click",function(e){e.stopPropagation();if(video!==document.pictureInPictureElement){video.requestPictureInPicture()}else{document.exitPictureInPicture()}});

// Audio Track
document.getElementById("audioBtn").addEventListener("click",function(e){e.stopPropagation();buildAudioMenu();audioMenu.classList.toggle("visible");qualityMenu.classList.remove("visible");speedMenu.classList.remove("visible")});
function buildAudioMenu(){if(!hls)return;audioMenu.innerHTML="";var tracks=hls.audioTracks;for(var i=0;i<tracks.length;i++){(function(idx){var opt=document.createElement("div");opt.className="audio-opt"+(idx===hls.audioTrack?" active":"");var name=tracks[idx].name||tracks[idx].language||("Track "+(idx+1));opt.innerHTML='<span class="check"><i class="fas fa-check"></i></span><span>'+name+'</span>';opt.onclick=function(e){e.stopPropagation();hls.audioTrack=idx;buildAudioMenu();audioMenu.classList.remove("visible")};audioMenu.appendChild(opt)})(i)}}

async function downloadVideo(){
window.location="/api/download/"+malId+"/"+curSeason+"/"+curEp;
}

// Quality
document.getElementById("qualityBtn").addEventListener("click",function(e){e.stopPropagation();qualityMenu.classList.toggle("visible");speedMenu.classList.remove("visible")});
function buildQualityMenu(levels,currentLevel){qualityMenu.innerHTML="";var auto=document.createElement("div");auto.className="quality-opt"+(currentLevel===-1?" active":"");auto.textContent="Auto";auto.onclick=function(e){e.stopPropagation();hls.currentLevel=-1;buildQualityMenu(hls.levels,hls.currentLevel);qualityMenu.classList.remove("visible")};qualityMenu.appendChild(auto);for(var i=0;i<levels.length;i++){(function(idx){var opt=document.createElement("div");opt.className="quality-opt"+(idx===currentLevel?" active":"");opt.textContent=levels[idx].height+"p";opt.onclick=function(e){e.stopPropagation();hls.currentLevel=idx;buildQualityMenu(hls.levels,idx);qualityMenu.classList.remove("visible")};qualityMenu.appendChild(opt)})(i)}}

// Speed
document.getElementById("speedBtn").addEventListener("click",function(e){e.stopPropagation();speedMenu.classList.toggle("visible");qualityMenu.classList.remove("visible")});
document.querySelectorAll(".speed-opt").forEach(function(el){el.addEventListener("click",function(e){e.stopPropagation();var spd=parseFloat(this.dataset.speed);video.playbackRate=spd;document.querySelectorAll(".speed-opt").forEach(function(s){s.classList.remove("active")});this.classList.add("active");speedMenu.classList.remove("visible")})});

document.addEventListener("click",function(){qualityMenu.classList.remove("visible");speedMenu.classList.remove("visible");audioMenu.classList.remove("visible")});

// HLS Setup
if(m3u8&&Hls.isSupported()){
  hls=new Hls({maxBufferLength:30,maxMaxBufferLength:90,maxBufferSize:60*1000*1000,maxBufferHole:0.5,enableWorker:true,lowLatencyMode:true,startLevel:-1,startFragPrefetch:true,manifestLoadingTimeOut:8000,levelLoadingTimeOut:8000,fragLoadingTimeOut:20000,backBufferLength:30,manifestLoadingMaxRetry:4,levelLoadingMaxRetry:4,fragLoadingMaxRetry:6,fragLoadingRetryDelay:500,abrBandWidthFactor:0.9,abrBandWidthUpFactor:0.6,abrEwmaFastLive:3.0,abrEwmaSlowLive:9.0});
  hls.loadSource(m3u8);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED,function(e,data){
    loading.classList.add("hidden");
    buildQualityMenu(hls.levels,hls.currentLevel);
    if(hls.audioTracks.length>0){var jpnIdx=0;for(var i=0;i<hls.audioTracks.length;i++){if(hls.audioTracks[i].language==="jpn"||hls.audioTracks[i].name.toLowerCase().indexOf("japanese")!==-1){jpnIdx=i;break}}hls.audioTrack=jpnIdx}
    var playPromise=video.play();
    if(playPromise!==undefined){playPromise.catch(function(){centerPlay.classList.add("visible")})}
  });
  hls.on(Hls.Events.ERROR,function(e,data){
    console.log("HLS error:",data.type,data.details,data.fatal);
    if(data.fatal){
      if(data.type===Hls.ErrorTypes.NETWORK_ERROR){
        hls.startLoad();
      }else if(data.type===Hls.ErrorTypes.MEDIA_ERROR){
        hls.recoverMediaError();
      }else{
        loading.classList.add("hidden");errorDiv.classList.add("visible");
      }
    }
  });
}else if(m3u8&&video.canPlayType("application/vnd.apple.mpegurl")){
  video.src=m3u8;video.addEventListener("loadedmetadata",function(){loading.classList.add("hidden");video.play().catch(function(){})});
}else{loading.classList.add("hidden");errorDiv.classList.add("visible")}

// Keyboard
document.addEventListener("keydown",function(e){if(e.target.tagName==="INPUT")return;switch(e.key){case" ":e.preventDefault();togglePlay();break;case"ArrowLeft":e.preventDefault();video.currentTime=Math.max(0,video.currentTime-10);break;case"ArrowRight":e.preventDefault();video.currentTime=Math.min(video.duration,video.currentTime+10);break;case"f":case"F":e.preventDefault();if(document.fullscreenElement)document.exitFullscreen();else playerContainer.requestFullscreen();break;case"m":case"M":e.preventDefault();video.muted=!video.muted;updateVolIcon();break;}});

function buildUrl(e){return "/api/player/"+malId+"/"+e}
function changeEp(d){var n=curEp+d;if(n<1)return;if(n>totalEps){if(curSeason<maxSeason)window.location=buildUrl(1);return}window.location=buildUrl(n)}

var eg=document.getElementById("epGrid");
for(var e=1;e<=totalEps;e++){var a=document.createElement("a");a.className="ep-btn"+(e===curEp?" active":"");a.href=buildUrl(e);a.textContent=e;eg.appendChild(a)}
var activeEp=document.querySelector(".ep-btn.active");if(activeEp)activeEp.scrollIntoView({inline:"center",block:"nearest"});

showControls();
</script>
</body></html>`;
}

function renderSeason(name, img, totalEps, mid) {
  const epRows = [];
  for (let i = 1; i <= totalEps; i++) {
    epRows.push(`<a href="/api/mal/${mid}/page?episode=${i}" class="ep-row" style="animation-delay:${0.02 * i}s;text-decoration:none;color:inherit">
<div class="ep-num"><span class="ep-num-text">${i}</span></div>
<div class="ep-info"><div class="ep-title">Episode ${i}</div><div class="ep-status"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ff6b35;margin-right:6px"></span>View Downloads</div></div>
<div class="ep-links"><i class="fas fa-chevron-right" style="color:rgba(255,255,255,0.2);font-size:14px"></i></div>
</a>`);
  }

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${name} Full Season - AnimeZilla</title>
<meta name="description" content="Download all ${totalEps} episodes of ${name}">
<meta property="og:title" content="${name} Full Season - AnimeZilla">
<meta property="og:image" content="${img}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
${SHARED_BG}
.season-page{max-width:600px;margin:0 auto;width:100%;padding:0 16px}
.hero{position:relative;padding:24px 0 32px;text-align:center;animation:su .6s ease-out}
.hero-bg{position:absolute;inset:0;overflow:hidden;border-radius:24px;margin:0 -8px}
.hero-bg img{width:100%;height:100%;object-fit:cover;filter:blur(40px) brightness(0.15) saturate(1.5);transform:scale(1.3)}
.hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,8,8,0.2),rgba(10,8,8,0.95))}
.hero-content{position:relative;z-index:2;padding:20px}
.hero-poster{width:140px;height:198px;border-radius:18px;overflow:hidden;margin:0 auto 20px;box-shadow:0 30px 70px rgba(255,60,47,0.25),0 0 0 1px rgba(255,255,255,0.08),0 0 60px rgba(255,100,0,0.1);transition:transform .4s}
.hero-poster:hover{transform:translateY(-6px) scale(1.03)}
.hero-poster img{width:100%;height:100%;object-fit:cover}
.hero-title{font-size:26px;font-weight:900;margin-bottom:8px;background:linear-gradient(135deg,#ff3c2f,#ff6b35,#ffaa00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 10px rgba(255,100,0,0.3))}
.hero-meta{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:20px}
.hero-stats{display:flex;justify-content:center;gap:24px}
.stat{display:flex;flex-direction:column;align-items:center;gap:4px}
.stat-num{font-size:22px;font-weight:800;background:linear-gradient(135deg,#ff6b35,#ffaa00);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{font-size:11px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;font-weight:600}

.season-section{margin-bottom:24px}
.section-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:16px;margin-bottom:12px}
.section-title{font-size:13px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase}
.section-badge{font-size:12px;font-weight:700;color:#ffaa00;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.2);padding:4px 12px;border-radius:20px}

.ep-list{display:flex;flex-direction:column;gap:8px}
.ep-row{display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:14px;transition:all .3s;animation:su .4s ease-out both}
.ep-row.hidden{display:none}
.ep-row:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,170,0,0.15);transform:translateX(4px)}
.search-box{position:relative;margin-bottom:16px}
.search-box input{width:100%;padding:14px 20px 14px 48px;border-radius:14px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);color:#fff;font-size:14px;font-family:'Inter',sans-serif;font-weight:600;outline:none;transition:all .3s;backdrop-filter:blur(10px)}
.search-box input::placeholder{color:rgba(255,255,255,0.25)}
.search-box input:focus{border-color:rgba(255,106,53,0.4);background:rgba(255,255,255,0.05);box-shadow:0 0 20px rgba(255,106,53,0.1)}
.search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.25);font-size:16px;pointer-events:none}
.search-clear{position:absolute;right:14px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.06);border:none;color:rgba(255,255,255,0.3);width:26px;height:26px;border-radius:8px;cursor:pointer;font-size:12px;display:none;align-items:center;justify-content:center;transition:all .2s}
.search-clear.show{display:flex}
.search-clear:hover{background:rgba(255,60,47,0.2);color:#ff6b35}
.no-results{display:none;text-align:center;padding:40px 20px;color:rgba(255,255,255,0.3);font-size:14px}
.no-results i{font-size:32px;color:rgba(255,60,47,0.3);margin-bottom:12px;display:block}
.ep-num{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(255,60,47,0.15),rgba(255,170,0,0.08));border:1px solid rgba(255,60,47,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ep-num-text{font-size:13px;font-weight:800;color:#ff6b35}
.ep-info{flex:1;min-width:0}
.ep-title{font-size:14px;font-weight:700;color:rgba(255,255,255,0.85);margin-bottom:2px}
.ep-status{font-size:11px;font-weight:500;display:flex;align-items:center}
.ep-links{display:flex;gap:6px;flex-shrink:0}
.ep-link{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:800;text-decoration:none;letter-spacing:0.5px;transition:all .3s}
.ep-link.sub-link{background:linear-gradient(135deg,#ff3c2f,#ff6b35);color:#fff;box-shadow:0 2px 10px rgba(255,60,47,0.3)}
.ep-link.sub-link:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(255,100,0,0.4)}
.ep-link.dub-link{background:rgba(255,170,0,0.15);border:1px solid rgba(255,170,0,0.25);color:#ffaa00}
.ep-link.dub-link:hover{background:rgba(255,170,0,0.25);transform:translateY(-2px)}
.ep-link.disabled-link{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);cursor:default}

.back-section{text-align:center;padding:20px 0 40px;animation:su .5s ease-out .3s both}
.back-btn{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#ff3c2f 0%,#ff6b35 50%,#ffaa00 100%);color:#fff;border:none;border-radius:14px;padding:14px 28px;font-size:14px;font-weight:700;text-decoration:none;transition:all .35s cubic-bezier(.4,0,.2,1);box-shadow:0 8px 30px rgba(255,60,47,0.3)}
.back-btn:hover{transform:translateY(-3px);box-shadow:0 14px 40px rgba(255,100,0,0.45)}
.back-btn i{transition:transform .3s}
.back-btn:hover i{transform:translateX(-3px)}

@media(max-width:480px){.hero-title{font-size:22px}.ep-row{padding:12px 14px;gap:10px}.hero-poster{width:120px;height:170px}}
</style></head><body>
<div class="bg-layer"><img src="${img}" alt=""></div>
<div class="bg-overlay"></div>
<div class="page">
<div class="header"><a href="https://animezilla.vercel.app" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a></div>
<div class="season-page">
<div class="hero">
<div class="hero-bg"><img src="${img}" alt=""></div>
<div class="hero-content">
<div class="hero-poster"><img src="${img}" alt="${name}"></div>
<h1 class="hero-title">${name}</h1>
<div class="hero-meta">Full Season Download</div>
<div class="hero-stats">
<div class="stat"><span class="stat-num">${totalEps}</span><span class="stat-label">Episodes</span></div>
</div>
</div>
</div>
<div class="season-section">
<div class="section-header"><span class="section-title">All Episodes</span><span class="section-badge">${totalEps} Total</span></div>
${totalEps > 30 ? `<div class="search-box"><i class="fas fa-search search-icon"></i><input type="text" id="epSearch" placeholder="Search episode number..." oninput="filterEps()"><button class="search-clear" id="clearBtn" onclick="document.getElementById('epSearch').value='';filterEps()"><i class="fas fa-times"></i></button></div>` : ""}
<div class="ep-list" id="epList">${epRows.join("")}</div>
<div class="no-results" id="noResults"><i class="fas fa-search"></i>No episodes found</div>
</div>
<div class="back-section"><a href="https://animezilla.vercel.app" class="back-btn"><i class="fas fa-arrow-left"></i> Back to Website</a></div>
</div>
<div class="footer"><p>Powered by <a href="https://animezilla.vercel.app">AnimeZilla</a></p></div>
</div>
<script>
function filterEps(){
  var q=document.getElementById("epSearch").value.trim().toLowerCase();
  var rows=document.querySelectorAll(".ep-row");
  var vis=0;
  rows.forEach(function(r){
    var n=r.querySelector(".ep-num-text");
    if(n){
      var num=n.textContent.trim();
      if(!q||num===q||num.indexOf(q)!==-1){r.classList.remove("hidden");vis++}
      else{r.classList.add("hidden")}
    }
  });
  document.getElementById("noResults").style.display=vis===0?"block":"none";
  document.getElementById("clearBtn").classList.toggle("show",q.length>0);
}
</script>
</body></html>`;
}

// ToonStream helpers
let ANIME_CACHE = null;
let CACHE_TIME = 0;

async function loadAnimeCache() {
  if (ANIME_CACHE && Date.now() - CACHE_TIME < 3600000) return ANIME_CACHE;
  try {
    const r = await fetch("https://blakiteapi.xyz/api/getAllAnime.php", { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.data) return null;
    // Index by title (lowercase) for fast lookup
    const index = {};
    const all = { ...d.data.series, ...d.data.movies };
    for (const [key, item] of Object.entries(all)) {
      const t = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (t) index[t] = item;
      // Also index by originalTmdbId
      if (item.originalTmdbId) index["tmdb_" + item.originalTmdbId] = item;
    }
    ANIME_CACHE = index;
    CACHE_TIME = Date.now();
    return ANIME_CACHE;
  } catch { return null; }
}

async function findAnimeByTitle(title) {
  const cache = await loadAnimeCache();
  if (!cache) return null;
  const t = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Direct match
  if (cache[t]) return cache[t];
  // Partial match
  for (const [key, item] of Object.entries(cache)) {
    if (key.includes(t) || t.includes(key)) return item;
  }
  return null;
}

async function getTvmazeSeasons(title) {
  try {
    const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return [];
    const results = await r.json();
    if (!results.length) return [];
    const showId = results[0].show.id;
    const sr = await fetch(`https://api.tvmaze.com/shows/${showId}/seasons`, { headers: { "User-Agent": UA } });
    if (!sr.ok) return [];
    const seasons = await sr.json();
    return seasons.map(s => ({ number: s.number, name: s.name || "", episodes: s.episodeOrder || 0, premiered: s.premiereDate || "" }));
  } catch { return []; }
}

function toonSlug(title) {
  const base = title.split(":")[0].split("-")[0].trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
  return base;
}

async function getTrembedUrl(episodeUrl) {
  try {
    const r = await fetch(episodeUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/iframe[^>]+src=["']?(https?:\/\/toonstream\.vip\/\?trembed=[^"'\s]+)/);
    if (!m) return null;
    return m[1].replace(/&amp;/g, "&").replace(/&#0?38;/g, "&");
  } catch { return null; }
}

async function getToonVideo(trembedUrl) {
  try {
    const r = await fetch(trembedUrl, { headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" } });
    if (!r.ok) return { error: "Failed to load trembed" };
    const html = await r.text();

    const srcMatch = html.match(/src="(https?:\/\/[^"]+\/video\/[a-f0-9]+)/) || html.match(/src=(https?:\/\/[^>\s]+\/video\/[a-f0-9]+)/);
    if (!srcMatch) return { error: "No video iframe found" };

    const iframeUrl = srcMatch[1].replace(/&amp;/g, "&");
    const vm = iframeUrl.match(/\/video\/([a-f0-9]+)/);
    if (!vm) return { error: "Cannot extract video ID" };

    return {
      video_id: vm[1],
      iframe_url: iframeUrl,
      embed_url: iframeUrl,
      note: "Open iframe_url in browser to play"
    };
  } catch (e) { return { error: e.message }; }
}

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

// Background prefetch: silently warm cache for next 1-2 segments
function prefetchManifestSegments(manifestText, headers) {
  try {
    const segUrls = [];
    const lines = manifestText.split('\n');
    for (let i = 0; i < lines.length && segUrls.length < 2; i++) {
      const l = lines[i].trim();
      if (l && !l.startsWith('#') && l.includes('.ts')) {
        const mpxyMatch = l.match(/\/api\/mpxy\?url=(.+)/);
        if (mpxyMatch) segUrls.push(decodeURIComponent(mpxyMatch[1]));
      }
    }
    segUrls.forEach(segUrl => {
      fetch(segUrl, { headers, agent: keepAliveAgent, redirect: "follow" }).catch(() => {});
    });
  } catch {}
}

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

const AK_XOR_KEY = "aproxy2026";

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
  const preferred = serversData.servers.find(s => s.id === "neko" || s.default) || serversData.servers[0];
  if (!preferred) throw new Error("No servers available on AniKage");
  const serverId = preferred.id;
  const sources = await anikageGetSources(anilistId, episodeNum, serverId, audioType);

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
    const label = t.label || "English";
    const srclang = t.srclang || t.lang || detectLangCode(label);
    return { file: subUrl || "", label, srclang, kind: "captions", default: t.default || false };
  }).filter(t => t.file);

  return {
    videoUrl: m3u8,
    tracks,
    server: serverId,
    servers: serversData.servers || [],
    embeds: sources.embeds || [],
    embedOptions: sources.embedOptions || [],
    intro: sources.intro || null,
    outro: sources.outro || null,
    fromScrape: false
  };
}

function renderEmbedOnly(m3u8Url, tracks, title, intro, outro, existingHash, malId) {
  const hash = existingHash || stableHash("eo", m3u8Url);
  if (!existingHash) m3u8Set(hash, m3u8Url);
  const trackTags = (tracks || []).filter(t => t.file && (t.kind === "captions" || t.kind === "subtitles" || !t.kind)).map(t => {
    const th = stableHash("tr", t.file);
    m3u8Set(th, t.file);
    const lang = t.srclang || "en";
    return `<track kind="captions" src="/api/mpxs/${th}" srclang="${lang}" label="${t.label || 'English'}" ${t.default ? "default" : ""}>`;
  }).join("\n");
  const introJSON = intro ? JSON.stringify(intro) : "null";
  const outroJSON = outro ? JSON.stringify(outro) : "null";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title || "AnimeZilla"}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--red:#e50914;--red2:#ff2e63;--red3:#ff6b8a;--glow:0 0 20px rgba(229,9,20,0.3),0 0 40px rgba(229,9,20,0.15);--glow-sm:0 0 12px rgba(229,9,20,0.25);--glow-lg:0 0 30px rgba(229,9,20,0.35),0 0 60px rgba(229,9,20,0.12)}
html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.player-box{position:relative;width:100%;height:100%;background:#000;overflow:hidden}
.player-box::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;box-shadow:inset 0 0 80px rgba(229,9,20,0.03)}
.video-poster{position:absolute;inset:0;width:100%;height:100%;background-size:cover;background-position:center;z-index:4;cursor:pointer;display:flex;align-items:center;justify-content:center}
.player-box video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
video::cue{background:rgba(0,0,0,0.85)!important;color:#fff!important;font-size:1.1em!important;line-height:1.6!important;padding:4px 12px!important;border-radius:6px!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif!important;text-shadow:0 0 8px rgba(0,0,0,0.5)!important}
.spinner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:52px;height:52px;border:3px solid rgba(255,255,255,0.05);border-top-color:var(--red);border-right-color:var(--red2);border-radius:50%;animation:spin .8s cubic-bezier(.4,0,.2,1) infinite;opacity:0;pointer-events:none;transition:opacity .2s;z-index:20;box-shadow:0 0 40px rgba(229,9,20,0.2)}
.spinner.show{opacity:1}
@keyframes spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
.cplay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;border-radius:50%;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);pointer-events:auto;opacity:0;backdrop-filter:blur(8px)}
.player-box:hover .cplay,.player-box.paused .cplay{opacity:1}
.cplay:hover{transform:translate(-50%,-50%) scale(1.12);background:rgba(229,9,20,0.2);border-color:var(--red);box-shadow:0 0 50px rgba(229,9,20,0.35),inset 0 0 30px rgba(229,9,20,0.05)}
.cplay.hidden{opacity:0!important;pointer-events:none;transform:translate(-50%,-50%) scale(.7)}
.cplay svg{width:34px;height:34px;fill:#fff;margin-left:4px;filter:drop-shadow(0 0 8px rgba(255,255,255,0.4))}
.ctrls{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent 0%,rgba(0,0,0,0.5) 25%,rgba(10,10,15,0.92) 100%);padding:44px 18px 12px;opacity:1;transition:opacity .35s ease;pointer-events:all;z-index:10}
.ctrls.hide{opacity:0;pointer-events:none}
.player-box.hidecur{cursor:none}
.pbar-wrap{width:100%;height:24px;display:flex;align-items:center;cursor:pointer;position:relative;margin-top:15px;margin-bottom:4px;touch-action:none}
.pbar{width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:4px;position:relative;transition:height .15s ease;overflow:hidden}
.pbar-wrap:hover .pbar,.pbar-wrap.touching .pbar{height:7px}
.pbar-buf{position:absolute;top:0;left:0;height:100%;background:rgba(255,255,255,0.08);border-radius:4px;pointer-events:none}
.pbar-fill{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,var(--red),var(--red2),var(--red3));border-radius:4px;pointer-events:none;box-shadow:var(--glow-lg);transition:width .05s linear}
.pbar-dot{position:absolute;top:50%;width:18px;height:18px;background:#fff;border:3px solid var(--red);border-radius:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity .12s ease;pointer-events:none;z-index:2;box-shadow:0 0 20px rgba(229,9,20,0.5),inset 0 0 6px rgba(229,9,20,0.15)}
.pbar-wrap:hover .pbar-dot,.pbar-wrap.touching .pbar-dot{opacity:1}
.pbar-tip{position:absolute;bottom:28px;transform:translateX(-50%);background:rgba(10,10,15,0.96);color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;pointer-events:none;display:none;white-space:nowrap;border:1px solid rgba(229,9,20,0.15);box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 12px rgba(229,9,20,0.08)}
.pbar-wrap:hover .pbar-tip,.pbar-wrap.touching .pbar-tip{display:block}
.crow{display:flex;align-items:center;justify-content:space-between}
.crow-l,.crow-r{display:flex;align-items:center}
.cbtn{background:none;border:none;color:#fff;cursor:pointer;padding:9px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:all .2s ease;position:relative;touch-action:manipulation;opacity:.8}
.cbtn:hover{opacity:1;background:rgba(229,9,20,0.15);box-shadow:0 0 24px rgba(229,9,20,0.15)}
.cbtn svg{width:26px;height:26px;fill:currentColor;display:block;transition:transform .2s ease}
.cbtn:hover svg{transform:scale(1.1)}
.cbtn.sm svg{width:20px;height:20px}
.skip-side{width:38px;height:38px;background:none;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#fff;touch-action:manipulation;opacity:.8;border-radius:10px;transition:all .2s ease}
.skip-side:hover{opacity:1;background:rgba(229,9,20,0.15);box-shadow:0 0 24px rgba(229,9,20,0.15)}
.skip-side svg{width:20px;height:20px;fill:currentColor;display:block}
.time-display{font-size:13px;font-weight:400;color:rgba(255,255,255,0.65);font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 8px;letter-spacing:.3px;font-feature-settings:'tnum' 1}
.vol-wrap{display:flex;align-items:center;position:relative}
.vol-slider{width:0;overflow:hidden;transition:width .25s ease}
.vol-wrap:hover .vol-slider{width:56px}
.vol-slider input[type=range]{-webkit-appearance:none;width:56px;height:4px;background:rgba(255,255,255,0.1);border-radius:4px;outline:none;cursor:pointer;margin:0 8px}
.vol-slider input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;background:#fff;border-radius:50%;cursor:pointer;box-shadow:0 0 14px rgba(229,9,20,0.4)}
.drop{position:absolute;bottom:54px;background:rgba(14,14,22,0.97);border:1px solid rgba(229,9,20,0.08);border-radius:14px;padding:8px 0;min-width:200px;max-height:360px;overflow-y:auto;box-shadow:0 16px 60px rgba(0,0,0,0.7),0 0 40px rgba(229,9,20,0.06);display:none;z-index:20;backdrop-filter:blur(20px)}
.drop.open{display:block;animation:dropIn .2s ease}
@keyframes dropIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.drop-hdr{font-size:11px;font-weight:700;color:var(--red);padding:8px 16px 6px;letter-spacing:.6px;text-transform:uppercase;text-shadow:0 0 10px rgba(229,9,20,0.2)}
.ditem{padding:10px 16px;font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;transition:all .15s ease;display:flex;align-items:center;justify-content:space-between;gap:20px;border-radius:6px;margin:2px 6px}
.ditem:hover{background:rgba(229,9,20,0.12);color:#fff}
.ditem.active{color:var(--red);font-weight:600;text-shadow:0 0 10px rgba(229,9,20,0.2)}
#qDrop{right:12px}#sDrop{right:54px}#cDrop{right:12px}
.skipbtn{position:absolute;bottom:120px;right:18px;background:linear-gradient(135deg,rgba(229,9,20,0.9),rgba(255,46,99,0.8));color:#fff;border:none;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:15;display:none;transition:all .25s ease;font-family:inherit;letter-spacing:.4px;border-radius:8px;box-shadow:0 4px 28px rgba(229,9,20,0.4),0 0 40px rgba(229,9,20,0.08)}
.skipbtn:hover{transform:scale(1.06);box-shadow:0 6px 36px rgba(229,9,20,0.55),0 0 60px rgba(229,9,20,0.12)}
.skipbtn.show{display:flex;align-items:center;gap:6px}
.toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(60px);background:rgba(10,10,15,0.94);color:#fff;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:500;z-index:500;transition:transform .3s cubic-bezier(.4,0,.2,1);pointer-events:none;backdrop-filter:blur(12px);border:1px solid rgba(229,9,20,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.toast.show{transform:translateX(-50%) translateY(0)}
@media(max-width:768px){
  .ctrls{padding:32px 12px 8px}
  .cbtn{padding:7px}
  .cbtn svg{width:22px;height:22px}
  .cbtn.sm svg{width:18px;height:18px}
  .skip-side{width:34px;height:34px}
  .skip-side svg{width:18px;height:18px}
  .vol-wrap{display:none}
  .time-display{font-size:12px;margin:0 4px}
  .pbar-wrap{height:22px}
  .pbar{height:3px}.pbar-wrap:hover .pbar{height:6px}
  .pbar-dot{width:14px;height:14px}
  .pbar-tip{bottom:26px;font-size:11px}
  .skipbtn{bottom:100px;right:12px;padding:7px 16px;font-size:12px}
}
@media(max-width:400px){
  .ctrls{padding:26px 8px 6px}
  .cbtn{padding:6px}
  .cbtn svg{width:20px;height:20px}
  .cbtn.sm svg{width:16px;height:16px}
  .skip-side{width:30px;height:30px}
  .skip-side svg{width:16px;height:16px}
  .time-display{font-size:11px;margin:0 3px}
  .pbar{height:3px}.pbar-wrap:hover .pbar{height:5px}
  .pbar-tip{bottom:24px;font-size:10px}
  .skipbtn{bottom:90px;right:8px;padding:6px 12px;font-size:11px}
}
</style></head><body>
<div class="player-box" id="box">
  <video id="vid" preload="auto" playsinline crossorigin>${trackTags}</video>
  ${malId ? `<div class="video-poster" id="poster" data-malid="${malId}"><div style="background:rgba(0,0,0,0.3);border-radius:50%;width:72px;height:72px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)"><svg viewBox="0 0 24 24" width="36" height="36" fill="#fff"><path d="M8 5v14l11-7z"/></svg></div></div>` : ""}
  <div class="spinner" id="spin"></div>
  <div class="cplay" id="cplay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
  <button class="skipbtn" id="skipbtn">SKIP &#9654;</button>
  <div class="ctrls" id="ctrls">
    <div class="pbar-wrap" id="pbarWrap">
      <div class="pbar"><div class="pbar-buf" id="buf"></div><div class="pbar-fill" id="fill"></div><div class="pbar-dot" id="dot"></div></div>
      <div class="pbar-tip" id="tip">0:00</div>
    </div>
    <div class="crow">
      <div class="crow-l">
        <button class="cbtn" id="playBtn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="cbtn sm skip-side" id="skipBack" title="-10s"><svg viewBox="0 0 24 24"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="15.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor">10</text></svg></button>
        <button class="cbtn sm skip-side" id="skipFwd" title="+10s"><svg viewBox="0 0 24 24"><path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="12" y="15.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor">10</text></svg></button>
        <div class="vol-wrap">
          <button class="cbtn sm" id="muteBtn"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/></svg></button>
          <div class="vol-slider"><input type="range" id="volRange" min="0" max="1" step="0.05" value="1"></div>
        </div>
        <span class="time-display"><span id="tcur">0:00</span> / <span id="tdur">0:00</span></span>
      </div>
      <div class="crow-r">
        <button class="cbtn sm" id="ccBtn" title="Subtitles/CC"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z"/></svg></button>
        <button class="cbtn sm" id="spdBtn" title="Playback speed"><svg viewBox="0 0 24 24"><path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44z"/><path d="M10.59 15.41a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z"/></svg></button>
        <button class="cbtn sm" id="qBtn" title="Quality"><svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.37 1.04.7 1.63.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.57 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z"/></svg></button>
        <button class="cbtn sm" id="pipBtn" title="Mini player"><svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg></button>
        <button class="cbtn" id="fsBtn" title="Full screen"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>
      </div>
    </div>
  </div>
  <div class="drop" id="qDrop"><div class="drop-hdr">Quality</div><div class="ditem active" id="qAuto">Auto</div><div id="qList"></div></div>
  <div class="drop" id="sDrop"><div class="drop-hdr">Speed</div><div class="ditem" data-sp="0.25">0.25</div><div class="ditem" data-sp="0.5">0.5</div><div class="ditem" data-sp="0.75">0.75</div><div class="ditem active" data-sp="1">Normal</div><div class="ditem" data-sp="1.25">1.25</div><div class="ditem" data-sp="1.5">1.5</div><div class="ditem" data-sp="2">2</div></div>
  <div class="drop" id="cDrop"><div class="drop-hdr">Subtitles/CC</div><div class="ditem active" id="ccOff">Off</div><div id="ccList"></div></div>
</div>
<div class="toast" id="toast"></div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
(function(){
var vid=document.getElementById('vid'),box=document.getElementById('box'),cplay=document.getElementById('cplay'),spin=document.getElementById('spin'),ctrls=document.getElementById('ctrls'),playBtn=document.getElementById('playBtn'),muteBtn=document.getElementById('muteBtn'),volRange=document.getElementById('volRange'),tcur=document.getElementById('tcur'),tdur=document.getElementById('tdur'),pbarWrap=document.getElementById('pbarWrap'),fill=document.getElementById('fill'),buf=document.getElementById('buf'),dot=document.getElementById('dot'),tip=document.getElementById('tip'),fsBtn=document.getElementById('fsBtn'),pipBtn=document.getElementById('pipBtn'),qBtn=document.getElementById('qBtn'),qDrop=document.getElementById('qDrop'),qAuto=document.getElementById('qAuto'),qList=document.getElementById('qList'),spdBtn=document.getElementById('spdBtn'),sDrop=document.getElementById('sDrop'),ccBtn=document.getElementById('ccBtn'),cDrop=document.getElementById('cDrop'),ccOff=document.getElementById('ccOff'),ccList=document.getElementById('ccList'),skipbtn=document.getElementById('skipbtn'),toastEl=document.getElementById('toast');
var hls=null,curTimer=null,touchSeeking=false,buffTimer=null;
var introData=${introJSON},outroData=${outroJSON};
function initHls(){
if(Hls.isSupported()){
   hls=new Hls({maxBufferLength:30,maxMaxBufferLength:90,maxBufferSize:60*1000*1000,maxBufferHole:0.5,enableWorker:true,lowLatencyMode:true,startLevel:0,startFragPrefetch:true,manifestLoadingTimeOut:8000,levelLoadingTimeOut:8000,fragLoadingTimeOut:20000,backBufferLength:30,manifestLoadingMaxRetry:4,levelLoadingMaxRetry:4,fragLoadingMaxRetry:6,fragLoadingRetryDelay:500,abrBandWidthFactor:0.9,abrBandWidthUpFactor:0.6,abrEwmaFastLive:3.0,abrEwmaSlowLive:9.0,nudgeOffset:0.15,nudgeMaxRetry:5,maxSeekHole:3});
  hls.loadSource('/api/mpxs/${hash}');
  hls.attachMedia(vid);
  hls.on(Hls.Events.MANIFEST_PARSED,function(e,d){buildQuality(d.levels);autoSubs()});
  hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){spin.classList.remove('show');showToast('Playback error')}});
}else if(vid.canPlayType('application/vnd.apple.mpegurl')){vid.src='/api/mpxs/${hash}'}
}
(function(){var p=document.getElementById('poster');if(p&&p.dataset.malid){fetch('/api/cover/'+p.dataset.malid).then(function(r){return r.json()}).then(function(d){if(d.image)p.style.backgroundImage='url('+d.image+')'})};initHls()})();
function autoSubs(retryCount){retryCount=retryCount||0;var tt=vid.textTracks;if(!tt||!tt.length){if(retryCount<15){setTimeout(function(){autoSubs(retryCount+1)},200)}return}
var defaultIdx=-1;
for(var i=0;i<tt.length;i++){var t=tt[i];t.mode='hidden';var label=(t.label||'').toLowerCase();if(label.includes('english')||label.includes('eng'))defaultIdx=i}
if(defaultIdx<0)defaultIdx=0;
if(tt[defaultIdx]){tt[defaultIdx].mode='showing';var applyLinePositions=function(){var cu=tt[defaultIdx].cues;if(!cu)return;for(var j=0;j<cu.length;j++){var c=cu[j];if(typeof c.line==='number'&&c.line>=-1)c.line=-2}};applyLinePositions();tt[defaultIdx].addEventListener('cuechange',applyLinePositions)}
buildCaptions()}
(function(){var trackEls=vid.querySelectorAll('track');trackEls.forEach(function(te){te.addEventListener('error',function(){console.warn('Subtitle track failed to load:',te.src,te.label)})})})();
setTimeout(function(){if(ccList)buildCaptions()},500)}
function buildQuality(levels){
  qList.innerHTML='';var seen={};
  levels.forEach(function(l,i){
    var h=l.height||0;if(!h||h<360||h>2160||seen[h])return;seen[h]=true;
    var el=document.createElement('div');el.className='ditem';el.textContent=h+'p';
    el.onclick=function(e){e.stopPropagation();if(hls){hls.currentLevel=i;hls.loadLevel=i}spin.classList.add('show');clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000);qList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});el.classList.add('active');qAuto.classList.remove('active');showToast(h+'p');closeDrops()};
    qList.appendChild(el);
  });
}
qAuto.onclick=function(e){e.stopPropagation();if(hls){hls.currentLevel=-1;hls.loadLevel=-1}spin.classList.add('show');clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000);qList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});qAuto.classList.add('active');showToast('Auto');closeDrops()};
function buildCaptions(){
  ccList.innerHTML='';var tt=vid.textTracks;if(!tt)return;
  for(var i=0;i<tt.length;i++){(function(idx){
    var t=tt[idx];t.mode='hidden';
    var el=document.createElement('div');el.className='ditem';el.textContent=t.label||'CC '+(idx+1);
    el.onclick=function(e){e.stopPropagation();for(var j=0;j<tt.length;j++)tt[j].mode='hidden';t.mode='showing';ccList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});el.classList.add('active');ccOff.classList.remove('active');showToast('CC: '+t.label);closeDrops()};
    ccList.appendChild(el);
  })(i)}
}
setTimeout(buildCaptions,1200);
ccOff.onclick=function(e){e.stopPropagation();var tt=vid.textTracks;if(tt)for(var i=0;i<tt.length;i++)tt[i].mode='hidden';ccList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});ccOff.classList.add('active');showToast('Subtitles Off');closeDrops()};
function closeDrops(){qDrop.classList.remove('open');sDrop.classList.remove('open');cDrop.classList.remove('open')}
function toggleDrop(d){var o=d.classList.contains('open');closeDrops();if(!o)d.classList.add('open')}
qBtn.onclick=function(e){e.stopPropagation();toggleDrop(qDrop)};
spdBtn.onclick=function(e){e.stopPropagation();toggleDrop(sDrop)};
ccBtn.onclick=function(e){e.stopPropagation();toggleDrop(cDrop)};
document.addEventListener('click',function(){closeDrops()});
[qDrop,sDrop,cDrop].forEach(function(d){d.onclick=function(e){e.stopPropagation()}});
sDrop.querySelectorAll('[data-sp]').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();vid.playbackRate=parseFloat(this.dataset.sp);sDrop.querySelectorAll('[data-sp]').forEach(function(b){b.classList.remove('active')});this.classList.add('active');showToast('Speed: '+this.textContent);closeDrops()}});
function togglePlay(){if(vid.paused){var p=vid.play();if(p)p.catch(function(){})}else{vid.pause()}}
function setPlayIcon(){playBtn.innerHTML=vid.paused?'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/>':'<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'}
cplay.onclick=function(e){e.stopPropagation();togglePlay()};
playBtn.onclick=function(e){e.stopPropagation();togglePlay()};
vid.onclick=function(e){e.stopPropagation();togglePlay();startHide()};
vid.onplay=function(){setPlayIcon();cplay.classList.add('hidden');box.classList.remove('paused');startHide();var p=document.getElementById('poster');if(p)p.style.display='none'};
vid.onpause=function(){if(!vid.ended){setPlayIcon();cplay.classList.remove('hidden');box.classList.add('paused');ctrls.classList.remove('hide');box.classList.remove('hidecur');clearTimeout(curTimer)}};
vid.onended=function(){setPlayIcon();cplay.classList.remove('hidden');box.classList.add('paused');ctrls.classList.remove('hide');box.classList.remove('hidecur');clearTimeout(curTimer)};
vid.onwaiting=function(){spin.classList.add('show');if(buffTimer)clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000)};
vid.oncanplay=function(){spin.classList.remove('show');if(buffTimer){clearTimeout(buffTimer);buffTimer=null}};
vid.onloadedmetadata=function(){tcur.textContent=fTime(vid.currentTime);tdur.textContent=fTime(vid.duration)};
vid.addEventListener('loadeddata',function(){autoSubs()});
vid.onplaying=function(){spin.classList.remove('show');if(buffTimer){clearTimeout(buffTimer);buffTimer=null}};
(function(){var p=document.getElementById('poster');if(p)p.onclick=function(){p.style.display='none';togglePlay()}})();
vid.ontimeupdate=function(){if(!vid.duration)return;var p=(vid.currentTime/vid.duration)*100;fill.style.width=p+'%';dot.style.left=p+'%';tcur.textContent=fTime(vid.currentTime);tdur.textContent=fTime(vid.duration);checkSkip(vid.currentTime)};
vid.onprogress=function(){if(vid.buffered.length>0)buf.style.width=(vid.buffered.end(vid.buffered.length-1)/vid.duration)*100+'%'};
var swiping=false,swipeStartX=0,swipeStartTime=0;
function seekFromEvent(clientX){var r=pbarWrap.getBoundingClientRect();vid.currentTime=Math.max(0,Math.min(vid.duration,((clientX-r.left)/r.width)*vid.duration))}
pbarWrap.onclick=function(e){e.stopPropagation();seekFromEvent(e.clientX);startHide()};
pbarWrap.onmousemove=function(e){var r=pbarWrap.getBoundingClientRect();var p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));tip.textContent=fTime(p*vid.duration);tip.style.left=(e.clientX-r.left)+'px'};
pbarWrap.addEventListener('touchstart',function(e){e.preventDefault();touchSeeking=true;pbarWrap.classList.add('touching');seekFromEvent(e.touches[0].clientX);startHide()},{passive:false});
pbarWrap.addEventListener('touchmove',function(e){e.preventDefault();if(!touchSeeking)return;seekFromEvent(e.touches[0].clientX);var r=pbarWrap.getBoundingClientRect();var p=Math.max(0,Math.min(1,(e.touches[0].clientX-r.left)/r.width));fill.style.width=(p*100)+'%';dot.style.left=(p*100)+'%';tip.textContent=fTime(p*vid.duration);tip.style.left=Math.max(0,Math.min(r.width,e.touches[0].clientX-r.left))+'px'},{passive:false});
pbarWrap.addEventListener('touchend',function(e){touchSeeking=false;pbarWrap.classList.remove('touching');startHide()});
vid.addEventListener('touchstart',function(e){if(e.target!==vid)return;swiping=true;swipeStartX=e.touches[0].clientX;swipeStartTime=vid.currentTime},{passive:true});
vid.addEventListener('touchmove',function(e){if(!swiping)return;var dx=e.touches[0].clientX-swipeStartX;var dur=vid.duration||600;var seekAmt=(dx/window.innerWidth)*dur;vid.currentTime=Math.max(0,Math.min(dur,swipeStartTime+seekAmt));var sec=Math.round(seekAmt);if(sec!==0)showToast((sec>0?'+':'')+sec+'s')},{passive:true});
vid.addEventListener('touchend',function(e){swiping=false;startHide()});
volRange.oninput=function(e){e.stopPropagation();vid.volume=parseFloat(this.value);vid.muted=false;updVol()};
muteBtn.onclick=function(e){e.stopPropagation();vid.muted=!vid.muted;updVol()};
function updVol(){muteBtn.innerHTML=(vid.muted||vid.volume===0)?'<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 8.5v2.14l2.45 2.45c.05-.2.05-.41.05-.59zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>':'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/>'}
fsBtn.onclick=function(e){e.stopPropagation();document.fullscreenElement?document.exitFullscreen():box.requestFullscreen()};
document.onfullscreenchange=function(){if(document.fullscreenElement&&screen.orientation&&screen.orientation.lock){screen.orientation.lock('landscape').catch(function(){})}};
pipBtn.onclick=function(e){e.stopPropagation();document.pictureInPictureElement?document.exitPictureInPicture():vid.requestPictureInPicture().catch(function(){})};
document.getElementById('skipBack').onclick=function(e){e.stopPropagation();vid.currentTime=Math.max(0,vid.currentTime-10);showToast('-10s');startHide()};
document.getElementById('skipFwd').onclick=function(e){e.stopPropagation();vid.currentTime=Math.min(vid.duration,vid.currentTime+10);showToast('+10s');startHide()};
function startHide(){clearTimeout(curTimer);ctrls.classList.remove('hide');box.classList.remove('hidecur');if(!vid.paused)curTimer=setTimeout(function(){ctrls.classList.add('hide');box.classList.add('hidecur')},3000)}
box.addEventListener('mousemove',startHide);
box.addEventListener('mouseleave',function(){clearTimeout(curTimer);if(!vid.paused)curTimer=setTimeout(function(){ctrls.classList.add('hide');box.classList.add('hidecur')},1000)});
box.addEventListener('touchstart',function(){if(vid.paused)return;startHide()},{passive:true});
box.ondblclick=function(e){if(e.target===vid||e.target===box)fsBtn.click()};
document.onkeydown=function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;switch(e.key){case' ':e.preventDefault();togglePlay();startHide();break;case'ArrowLeft':e.preventDefault();vid.currentTime=Math.max(0,vid.currentTime-10);showToast('-10s');startHide();break;case'ArrowRight':e.preventDefault();vid.currentTime=Math.min(vid.duration,vid.currentTime+10);showToast('+10s');startHide();break;case'ArrowUp':e.preventDefault();vid.volume=Math.min(1,vid.volume+0.1);volRange.value=vid.volume;showToast(Math.round(vid.volume*100)+'%');startHide();break;case'ArrowDown':e.preventDefault();vid.volume=Math.max(0,vid.volume-0.1);volRange.value=vid.volume;showToast(Math.round(vid.volume*100)+'%');startHide();break;case'f':case'F':fsBtn.click();break;case'm':case'M':muteBtn.click();break}};
var skipShown=false;
function checkSkip(t){if(introData&&t>=introData.start&&t<introData.end&&!skipShown){skipbtn.innerHTML='SKIP INTRO &#9654;';skipbtn.classList.add('show');skipShown=true;skipbtn.onclick=function(){vid.currentTime=introData.end;skipbtn.classList.remove('show');skipShown=false;showToast('Intro Skipped')}}else if(outroData&&t>=outroData.start&&t<outroData.end&&!skipShown){skipbtn.innerHTML='SKIP OUTRO &#9654;';skipbtn.classList.add('show');skipShown=true;skipbtn.onclick=function(){vid.currentTime=outroData.end;skipbtn.classList.remove('show');skipShown=false;showToast('Outro Skipped')}}else if(skipShown){var done=false;if(introData&&t>=introData.end)done=true;if(outroData&&t>=outroData.end)done=true;if(!introData&&!outroData)done=true;if(done){skipbtn.classList.remove('show');skipShown=false}}}
function fTime(s){if(!s||isNaN(s))return'0:00';var m=Math.floor(s/60);var sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
function showToast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(function(){toastEl.classList.remove('show')},1400)}
})();
</script></body></html>`;
}
function renderMegaPlayer(m3u8Url, tracks, title, intro, outro, malId, epNum) {
  const hash = stableHash("mp", m3u8Url);
  m3u8Set(hash, m3u8Url);
  const trackTags = (tracks || []).filter(t => t.file && (t.kind === "captions" || t.kind === "subtitles" || !t.kind)).map(t => {
    const th = stableHash("tr", t.file);
    m3u8Set(th, t.file);
    const lang = t.srclang || "en";
    return `<track kind="captions" src="/api/mpxs/${th}" srclang="${lang}" label="${t.label || 'English'}" ${t.default ? "default" : ""}>`;
  }).join("\n");
  const titleClean = title ? title.replace(/[-\s]*EP\d+/i, "").trim() : "Anime";
  const introJSON = intro ? JSON.stringify(intro) : "null";
  const outroJSON = outro ? JSON.stringify(outro) : "null";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title || "AnimeZilla"} - AnimeZilla</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--red:#e50914;--red2:#ff2e63;--red3:#ff6b8a;--glow:0 0 20px rgba(229,9,20,0.3),0 0 40px rgba(229,9,20,0.15);--glow-sm:0 0 12px rgba(229,9,20,0.25);--glow-lg:0 0 30px rgba(229,9,20,0.35),0 0 60px rgba(229,9,20,0.12);--bg:#0a0a0f;--bg2:#12121a;--bg3:#1c1c28;--surface:rgba(255,255,255,0.04);--surface-hover:rgba(255,255,255,0.08);--text:#eee;--text2:#888}
body{background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:var(--text);overflow-x:hidden;min-height:100vh;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(229,9,20,0.05) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(229,9,20,0.03) 0%,transparent 50%),radial-gradient(ellipse at 20% 80%,rgba(229,9,20,0.02) 0%,transparent 40%);pointer-events:none;z-index:0}
.player-bg{position:fixed;inset:0;z-index:-1;background-size:cover;background-position:center;background-repeat:no-repeat}
.player-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,15,0.7) 0%,rgba(10,10,15,0.85) 100%)}
.video-poster{position:absolute;inset:0;width:100%;height:100%;background-size:cover;background-position:center;z-index:4;cursor:pointer;display:flex;align-items:center;justify-content:center}
.topbar{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:linear-gradient(180deg,rgba(10,10,15,0.95) 0%,rgba(10,10,15,0.4) 70%,transparent 100%);backdrop-filter:blur(20px);transition:transform .3s ease}
.topbar.hide{transform:translateY(-100%)}
.topbar .back{display:flex;align-items:center;gap:8px;color:var(--text2);text-decoration:none;font-size:13px;font-weight:500;transition:all .25s;padding:8px 14px;border-radius:10px;background:var(--surface)}
.topbar .back:hover{color:#fff;background:var(--surface-hover)}
.topbar .back svg{width:18px;height:18px}
.topbar .ep-title{font-size:14px;font-weight:500;color:var(--text);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}
.topbar .type-badge{font-size:10px;font-weight:700;padding:4px 14px;background:linear-gradient(135deg,var(--red),var(--red2));color:#fff;border-radius:4px;letter-spacing:.5px;text-transform:uppercase;box-shadow:var(--glow-sm),0 0 30px rgba(229,9,20,0.15)}
.player-wrap{width:100%;max-width:1100px;margin:60px auto 0;position:relative;z-index:1;padding:0 4px}
.player-box{position:relative;background:#000;overflow:hidden;aspect-ratio:16/9;border-radius:16px;box-shadow:0 0 60px rgba(229,9,20,0.06),0 0 120px rgba(229,9,20,0.03),0 20px 80px rgba(0,0,0,0.5)}
.player-box::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;box-shadow:inset 0 0 80px rgba(229,9,20,0.03)}
.player-box:fullscreen{border-radius:0;margin:0;max-width:none}
.player-box video{width:100%;height:100%;display:block;object-fit:contain;background:#000;position:relative;z-index:1}
video::cue{background:rgba(0,0,0,0.85)!important;color:#fff!important;font-size:1.1em!important;line-height:1.6!important;padding:4px 12px!important;border-radius:6px!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif!important;text-shadow:0 0 8px rgba(0,0,0,0.5)!important}
.spinner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:52px;height:52px;border:3px solid rgba(255,255,255,0.05);border-top-color:var(--red);border-right-color:var(--red2);border-radius:50%;animation:spin .8s cubic-bezier(.4,0,.2,1) infinite;opacity:0;pointer-events:none;transition:opacity .2s;z-index:20;box-shadow:0 0 40px rgba(229,9,20,0.2)}
.spinner.show{opacity:1}
@keyframes spin{to{transform:translate(-50%,-50%) rotate(360deg)}}
.cplay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;border-radius:50%;background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);pointer-events:auto;opacity:0;backdrop-filter:blur(8px)}
.player-box:hover .cplay,.player-box.paused .cplay{opacity:1}
.cplay:hover{transform:translate(-50%,-50%) scale(1.12);background:rgba(229,9,20,0.2);border-color:var(--red);box-shadow:0 0 50px rgba(229,9,20,0.35),inset 0 0 30px rgba(229,9,20,0.05)}
.cplay.hidden{opacity:0!important;pointer-events:none;transform:translate(-50%,-50%) scale(.7)}
.cplay svg{width:34px;height:34px;fill:#fff;margin-left:4px;filter:drop-shadow(0 0 8px rgba(255,255,255,0.4))}
.ctrls{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent 0%,rgba(0,0,0,0.5) 25%,rgba(10,10,15,0.92) 100%);padding:44px 18px 12px;opacity:1;transition:opacity .35s ease;pointer-events:all;z-index:10}
.ctrls.hide{opacity:0;pointer-events:none}
.player-box.hidecur{cursor:none}
.pbar-wrap{width:100%;height:24px;display:flex;align-items:center;cursor:pointer;position:relative;margin-top:15px;margin-bottom:4px;touch-action:none}
.pbar{width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:4px;position:relative;transition:height .15s ease;overflow:hidden}
.pbar-wrap:hover .pbar,.pbar-wrap.touching .pbar{height:7px}
.pbar-buf{position:absolute;top:0;left:0;height:100%;background:rgba(255,255,255,0.08);border-radius:4px;pointer-events:none}
.pbar-fill{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,var(--red),var(--red2),var(--red3));border-radius:4px;pointer-events:none;box-shadow:var(--glow-lg);transition:width .05s linear}
.pbar-dot{position:absolute;top:50%;width:18px;height:18px;background:#fff;border:3px solid var(--red);border-radius:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity .12s ease;pointer-events:none;z-index:2;box-shadow:0 0 20px rgba(229,9,20,0.5),inset 0 0 6px rgba(229,9,20,0.15)}
.pbar-wrap:hover .pbar-dot,.pbar-wrap.touching .pbar-dot{opacity:1}
.pbar-tip{position:absolute;bottom:28px;transform:translateX(-50%);background:rgba(10,10,15,0.96);color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;pointer-events:none;display:none;white-space:nowrap;border:1px solid rgba(229,9,20,0.15);box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 12px rgba(229,9,20,0.08)}
.pbar-wrap:hover .pbar-tip,.pbar-wrap.touching .pbar-tip{display:block}
.crow{display:flex;align-items:center;justify-content:space-between}
.crow-l,.crow-r{display:flex;align-items:center}
.cbtn{background:none;border:none;color:#fff;cursor:pointer;padding:9px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:all .2s ease;position:relative;touch-action:manipulation;opacity:.8}
.cbtn:hover{opacity:1;background:rgba(229,9,20,0.15);box-shadow:0 0 24px rgba(229,9,20,0.15)}
.cbtn svg{width:26px;height:26px;fill:currentColor;display:block;transition:transform .2s ease}
.cbtn:hover svg{transform:scale(1.1)}
.cbtn.sm svg{width:20px;height:20px}
.skip-side{width:38px;height:38px;background:none;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#fff;touch-action:manipulation;opacity:.8;border-radius:10px;transition:all .2s ease}
.skip-side:hover{opacity:1;background:rgba(229,9,20,0.15);box-shadow:0 0 24px rgba(229,9,20,0.15)}
.skip-side svg{width:20px;height:20px;fill:currentColor;display:block}
.time-display{font-size:13px;font-weight:400;color:rgba(255,255,255,0.65);font-variant-numeric:tabular-nums;white-space:nowrap;margin:0 8px;letter-spacing:.3px;font-feature-settings:'tnum' 1}
.vol-wrap{display:flex;align-items:center;position:relative}
.vol-slider{width:0;overflow:hidden;transition:width .25s ease}
.vol-wrap:hover .vol-slider{width:56px}
.vol-slider input[type=range]{-webkit-appearance:none;width:56px;height:4px;background:rgba(255,255,255,0.1);border-radius:4px;outline:none;cursor:pointer;margin:0 8px}
.vol-slider input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;background:#fff;border-radius:50%;cursor:pointer;box-shadow:0 0 14px rgba(229,9,20,0.4)}
.drop{position:absolute;bottom:54px;background:rgba(14,14,22,0.97);border:1px solid rgba(229,9,20,0.08);border-radius:14px;padding:8px 0;min-width:200px;max-height:360px;overflow-y:auto;box-shadow:0 16px 60px rgba(0,0,0,0.7),0 0 40px rgba(229,9,20,0.06);display:none;z-index:20;backdrop-filter:blur(20px)}
.drop.open{display:block;animation:dropIn .2s ease}
@keyframes dropIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.drop-hdr{font-size:11px;font-weight:700;color:var(--red);padding:8px 16px 6px;letter-spacing:.6px;text-transform:uppercase;text-shadow:0 0 10px rgba(229,9,20,0.2)}
.ditem{padding:10px 16px;font-size:13px;color:rgba(255,255,255,0.5);cursor:pointer;transition:all .15s ease;display:flex;align-items:center;justify-content:space-between;gap:20px;border-radius:6px;margin:2px 6px}
.ditem:hover{background:rgba(229,9,20,0.12);color:#fff}
.ditem.active{color:var(--red);font-weight:600;text-shadow:0 0 10px rgba(229,9,20,0.2)}
#qDrop{right:12px}#sDrop{right:54px}#cDrop{right:12px}
.skipbtn{position:absolute;bottom:120px;right:18px;background:linear-gradient(135deg,rgba(229,9,20,0.9),rgba(255,46,99,0.8));color:#fff;border:none;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:15;display:none;transition:all .25s ease;font-family:inherit;letter-spacing:.4px;border-radius:8px;box-shadow:0 4px 28px rgba(229,9,20,0.4),0 0 40px rgba(229,9,20,0.08)}
.skipbtn:hover{transform:scale(1.06);box-shadow:0 6px 36px rgba(229,9,20,0.55),0 0 60px rgba(229,9,20,0.12)}
.skipbtn.show{display:flex;align-items:center;gap:6px}
.toast{position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(60px);background:rgba(10,10,15,0.94);color:#fff;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:500;z-index:500;transition:transform .3s cubic-bezier(.4,0,.2,1);pointer-events:none;backdrop-filter:blur(12px);border:1px solid rgba(229,9,20,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.toast.show{transform:translateX(-50%) translateY(0)}
.info{width:100%;max-width:1100px;margin:0 auto;padding:20px 16px 8px}
.info h1{font-size:1.35rem;font-weight:700;color:#fff;margin-bottom:4px;letter-spacing:-.3px;text-shadow:0 0 20px rgba(229,9,20,0.05)}
.info .meta{font-size:.8rem;color:var(--text2);display:flex;gap:16px;flex-wrap:wrap}
.info .meta span{display:flex;align-items:center;gap:6px;padding:3px 10px;background:var(--surface);border-radius:6px}
.nav{width:100%;max-width:1100px;margin:0 auto;padding:0 16px 36px;display:flex;gap:12px}
.nav a{flex:1;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;text-align:center;transition:all .25s ease;background:var(--surface);color:var(--text2);font-family:inherit;border:1px solid rgba(255,255,255,0.04);letter-spacing:.3px}
.nav a:hover{background:linear-gradient(135deg,rgba(229,9,20,0.15),rgba(255,46,99,0.08));border-color:rgba(229,9,20,0.25);color:#fff;box-shadow:0 0 30px rgba(229,9,20,0.1)}
.nav a.disabled{opacity:0.15;pointer-events:none}
@media(max-width:768px){
  .player-box{border-radius:12px}
  .ctrls{padding:32px 12px 8px}
  .cbtn{padding:7px}
  .cbtn svg{width:22px;height:22px}
  .cbtn.sm svg{width:18px;height:18px}
  .skip-side{width:34px;height:34px}
  .skip-side svg{width:18px;height:18px}
  .vol-wrap{display:none}
  .time-display{font-size:12px;margin:0 4px}
  .pbar-wrap{height:22px}
  .pbar{height:3px}.pbar-wrap:hover .pbar{height:6px}
  .pbar-dot{width:14px;height:14px}
  .pbar-tip{bottom:26px;font-size:11px}
  .topbar{padding:10px 16px}
  .topbar .ep-title{font-size:12px;max-width:50%}
  .topbar .back{font-size:12px;padding:6px 10px}
  .topbar .back svg{width:16px;height:16px}
  .topbar .type-badge{font-size:9px;padding:3px 10px}
  .skipbtn{bottom:100px;right:12px;padding:7px 16px;font-size:12px}
  .info{padding:16px 12px 6px}
  .info h1{font-size:1.1rem}
  .nav{padding:0 12px 28px;gap:10px}
  .nav a{padding:12px 16px;font-size:13px}
}
@media(max-width:400px){
  .player-box{border-radius:8px}
  .ctrls{padding:26px 8px 6px}
  .cbtn{padding:6px}
  .cbtn svg{width:20px;height:20px}
  .cbtn.sm svg{width:16px;height:16px}
  .skip-side{width:30px;height:30px}
  .skip-side svg{width:16px;height:16px}
  .time-display{font-size:11px;margin:0 3px}
  .pbar{height:3px}.pbar-wrap:hover .pbar{height:5px}
  .pbar-tip{bottom:24px;font-size:10px}
  .topbar .ep-title{font-size:11px}
  .topbar .back{font-size:11px}
  .skipbtn{bottom:90px;right:8px;padding:6px 12px;font-size:11px}
  .nav a{padding:10px 12px;font-size:11px}
  .info h1{font-size:1rem}
}
</style></head><body>
<div class="topbar" id="topbar">
  <a class="back" href="javascript:history.back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back</a>
  <div class="ep-title">${titleClean} — EP ${epNum}</div>
  <div class="type-badge">SUB</div>
</div>
${bgImage ? `<div class="player-bg" id="detail-bg" style="background-image:url('${bgImage}')"></div>` : ""}
<div class="player-wrap">
<div class="player-box" id="box">
  <video id="vid" preload="auto" playsinline crossorigin>${trackTags}</video>
  ${malId ? `<div class="video-poster" id="poster" data-malid="${malId}"><div style="background:rgba(0,0,0,0.3);border-radius:50%;width:72px;height:72px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)"><svg viewBox="0 0 24 24" width="36" height="36" fill="#fff"><path d="M8 5v14l11-7z"/></svg></div></div>` : ""}
  <div class="spinner" id="spin"></div>
  <div class="cplay" id="cplay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
  <button class="skipbtn" id="skipbtn">SKIP INTRO &#9654;</button>
  <div class="ctrls" id="ctrls">
    <div class="pbar-wrap" id="pbarWrap">
      <div class="pbar"><div class="pbar-buf" id="buf"></div><div class="pbar-fill" id="fill"></div><div class="pbar-dot" id="dot"></div></div>
      <div class="pbar-tip" id="tip">0:00</div>
    </div>
    <div class="crow">
      <div class="crow-l">
        <button class="cbtn" id="playBtn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="cbtn sm skip-side" id="skipBack" title="-10s"><svg viewBox="0 0 24 24"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><text x="12" y="15.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor">10</text></svg></button>
        <button class="cbtn sm skip-side" id="skipFwd" title="+10s"><svg viewBox="0 0 24 24"><path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/><text x="12" y="15.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor">10</text></svg></button>
        <div class="vol-wrap">
          <button class="cbtn sm" id="muteBtn"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/></svg></button>
          <div class="vol-slider"><input type="range" id="volRange" min="0" max="1" step="0.05" value="1"></div>
        </div>
        <span class="time-display"><span id="tcur">0:00</span> / <span id="tdur">0:00</span></span>
      </div>
      <div class="crow-r">
        <button class="cbtn sm" id="ccBtn" title="Subtitles"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h8v2H6v-2zm10 0h2v2h-2v-2zm-6-4h8v2h-8v-2z"/></svg></button>
        <button class="cbtn sm" id="spdBtn" title="Speed"><svg viewBox="0 0 24 24"><path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44z"/><path d="M10.59 15.41a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z"/></svg></button>
        <button class="cbtn sm" id="qBtn" title="Quality"><svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.37 1.04.7 1.63.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.57 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z"/></svg></button>
        <button class="cbtn sm" id="pipBtn" title="Mini Player"><svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg></button>
        <button class="cbtn" id="fsBtn" title="Fullscreen"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>
      </div>
    </div>
  </div>
  <div class="drop" id="qDrop"><div class="drop-hdr">Quality</div><div class="ditem active" id="qAuto">Auto</div><div id="qList"></div></div>
  <div class="drop" id="sDrop"><div class="drop-hdr">Speed</div><div class="ditem" data-sp="0.5">0.5x</div><div class="ditem" data-sp="0.75">0.75x</div><div class="ditem active" data-sp="1">Normal</div><div class="ditem" data-sp="1.25">1.25x</div><div class="ditem" data-sp="1.5">1.5x</div><div class="ditem" data-sp="2">2x</div></div>
  <div class="drop" id="cDrop"><div class="drop-hdr">Subtitles</div><div class="ditem active" id="ccOff">Off</div><div id="ccList"></div></div>
</div>
</div>
<div class="info"><h1>${titleClean}</h1><div class="meta"><span>Episode ${epNum}</span>${intro ? `<span>Skip intro available</span>` : ""}</div></div>
<div class="nav">
  <a href="/api/player/${malId}/${epNum - 1}" class="${epNum <= 1 ? 'disabled' : ''}">&#9664; Previous Episode</a>
  <a href="/api/player/${malId}/${epNum + 1}">Next Episode &#9654;</a>
</div>
<div class="toast" id="toast"></div>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
(function(){
var vid=document.getElementById('vid'),box=document.getElementById('box'),cplay=document.getElementById('cplay'),spin=document.getElementById('spin'),ctrls=document.getElementById('ctrls'),playBtn=document.getElementById('playBtn'),muteBtn=document.getElementById('muteBtn'),volRange=document.getElementById('volRange'),tcur=document.getElementById('tcur'),tdur=document.getElementById('tdur'),pbarWrap=document.getElementById('pbarWrap'),fill=document.getElementById('fill'),buf=document.getElementById('buf'),dot=document.getElementById('dot'),tip=document.getElementById('tip'),fsBtn=document.getElementById('fsBtn'),pipBtn=document.getElementById('pipBtn'),qBtn=document.getElementById('qBtn'),qDrop=document.getElementById('qDrop'),qAuto=document.getElementById('qAuto'),qList=document.getElementById('qList'),spdBtn=document.getElementById('spdBtn'),sDrop=document.getElementById('sDrop'),ccBtn=document.getElementById('ccBtn'),cDrop=document.getElementById('cDrop'),ccOff=document.getElementById('ccOff'),ccList=document.getElementById('ccList'),skipbtn=document.getElementById('skipbtn'),toastEl=document.getElementById('toast'),topbar=document.getElementById('topbar');
var hls=null,curTimer=null,touchSeeking=false,buffTimer=null;
var introData=${introJSON},outroData=${outroJSON};
function initHls(){
if(Hls.isSupported()){
  hls=new Hls({maxBufferLength:30,maxMaxBufferLength:90,maxBufferSize:60*1000*1000,maxBufferHole:0.5,enableWorker:true,lowLatencyMode:true,startLevel:0,startFragPrefetch:true,manifestLoadingTimeOut:8000,levelLoadingTimeOut:8000,fragLoadingTimeOut:20000,backBufferLength:30,manifestLoadingMaxRetry:4,levelLoadingMaxRetry:4,fragLoadingMaxRetry:6,fragLoadingRetryDelay:500,abrBandWidthFactor:0.9,abrBandWidthUpFactor:0.6,abrEwmaFastLive:3.0,abrEwmaSlowLive:9.0,nudgeOffset:0.15,nudgeMaxRetry:5,maxSeekHole:3});
  hls.loadSource('/api/mpxs/${hash}');
  hls.attachMedia(vid);
  hls.on(Hls.Events.MANIFEST_PARSED,function(e,d){buildQuality(d.levels);autoSubs()});
  hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){spin.classList.remove('show');showToast('Playback error')}});
}else if(vid.canPlayType('application/vnd.apple.mpegurl')){vid.src='/api/mpxs/${hash}'}
}
(function(){var p=document.getElementById('poster');if(p&&p.dataset.malid){fetch('/api/cover/'+p.dataset.malid).then(function(r){return r.json()}).then(function(d){if(d.image)p.style.backgroundImage='url('+d.image+')'})};initHls()})();
function autoSubs(retryCount){retryCount=retryCount||0;var tt=vid.textTracks;if(!tt||!tt.length){if(retryCount<15){setTimeout(function(){autoSubs(retryCount+1)},200)}return}
var defaultIdx=-1;
for(var i=0;i<tt.length;i++){var t=tt[i];t.mode='hidden';var label=(t.label||'').toLowerCase();if(label.includes('english')||label.includes('eng'))defaultIdx=i}
if(defaultIdx<0)defaultIdx=0;
if(tt[defaultIdx]){tt[defaultIdx].mode='showing';var applyLinePositions=function(){var cu=tt[defaultIdx].cues;if(!cu)return;for(var j=0;j<cu.length;j++){var c=cu[j];if(typeof c.line==='number'&&c.line>=-1)c.line=-2}};applyLinePositions();tt[defaultIdx].addEventListener('cuechange',applyLinePositions)}
buildCaptions()}
(function(){var trackEls=vid.querySelectorAll('track');trackEls.forEach(function(te){te.addEventListener('error',function(){console.warn('Subtitle track failed to load:',te.src,te.label)})})})();
setTimeout(buildCaptions,500);
function buildQuality(levels){qList.innerHTML='';var seen={};levels.forEach(function(l,i){var h=l.height||0;if(!h||h<360||h>2160||seen[h])return;seen[h]=true;var el=document.createElement('div');el.className='ditem';el.textContent=h+'p';el.onclick=function(e){e.stopPropagation();if(hls){hls.currentLevel=i;hls.loadLevel=i}spin.classList.add('show');clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000);qList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});el.classList.add('active');qAuto.classList.remove('active');showToast(h+'p');closeDrops()};qList.appendChild(el)})}
qAuto.onclick=function(e){e.stopPropagation();if(hls){hls.currentLevel=-1;hls.loadLevel=-1}spin.classList.add('show');clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000);qList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});qAuto.classList.add('active');showToast('Auto');closeDrops()};
function buildCaptions(){ccList.innerHTML='';var tt=vid.textTracks;if(!tt)return;for(var i=0;i<tt.length;i++){(function(idx){var t=tt[idx];t.mode='hidden';var el=document.createElement('div');el.className='ditem';el.textContent=t.label||'CC '+(idx+1);el.onclick=function(e){e.stopPropagation();for(var j=0;j<tt.length;j++)tt[j].mode='hidden';t.mode='showing';ccList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});el.classList.add('active');ccOff.classList.remove('active');showToast('CC: '+t.label);closeDrops()};ccList.appendChild(el)})(i)}}
setTimeout(buildCaptions,1200);
ccOff.onclick=function(e){e.stopPropagation();var tt=vid.textTracks;if(tt)for(var i=0;i<tt.length;i++)tt[i].mode='hidden';ccList.querySelectorAll('.ditem').forEach(function(b){b.classList.remove('active')});ccOff.classList.add('active');showToast('Subtitles Off');closeDrops()};
function closeDrops(){qDrop.classList.remove('open');sDrop.classList.remove('open');cDrop.classList.remove('open')}
function toggleDrop(d){var o=d.classList.contains('open');closeDrops();if(!o)d.classList.add('open')}
qBtn.onclick=function(e){e.stopPropagation();toggleDrop(qDrop)};
spdBtn.onclick=function(e){e.stopPropagation();toggleDrop(sDrop)};
ccBtn.onclick=function(e){e.stopPropagation();toggleDrop(cDrop)};
document.addEventListener('click',function(){closeDrops()});
[qDrop,sDrop,cDrop].forEach(function(d){d.onclick=function(e){e.stopPropagation()}});
sDrop.querySelectorAll('[data-sp]').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();vid.playbackRate=parseFloat(this.dataset.sp);sDrop.querySelectorAll('[data-sp]').forEach(function(b){b.classList.remove('active')});this.classList.add('active');showToast('Speed: '+this.textContent);closeDrops()}});
function togglePlay(){if(vid.paused){var p=vid.play();if(p)p.catch(function(){})}else{vid.pause()}}
function setPlayIcon(){playBtn.innerHTML=vid.paused?'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/>':'<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'}
cplay.onclick=function(e){e.stopPropagation();togglePlay()};
playBtn.onclick=function(e){e.stopPropagation();togglePlay()};
vid.onclick=function(e){e.stopPropagation();togglePlay();startHide()};
vid.onplay=function(){setPlayIcon();cplay.classList.add('hidden');startHide();var p=document.getElementById('poster');if(p)p.style.display='none'};
vid.onpause=function(){if(!vid.ended){setPlayIcon();cplay.classList.remove('hidden');ctrls.classList.remove('hide');box.classList.remove('hidecur');clearTimeout(curTimer)}};
vid.onended=function(){setPlayIcon();cplay.classList.remove('hidden');ctrls.classList.remove('hide');box.classList.remove('hidecur');clearTimeout(curTimer)};
vid.onwaiting=function(){spin.classList.add('show');if(buffTimer)clearTimeout(buffTimer);buffTimer=setTimeout(function(){spin.classList.remove('show')},15000)};
vid.oncanplay=function(){spin.classList.remove('show');if(buffTimer){clearTimeout(buffTimer);buffTimer=null}};
vid.onloadedmetadata=function(){tcur.textContent=fTime(vid.currentTime);tdur.textContent=fTime(vid.duration)};
vid.addEventListener('loadeddata',function(){autoSubs()});
vid.onplaying=function(){spin.classList.remove('show');if(buffTimer){clearTimeout(buffTimer);buffTimer=null}};
(function(){var p=document.getElementById('poster');if(p)p.onclick=function(){p.style.display='none';togglePlay()}})();
vid.ontimeupdate=function(){if(!vid.duration)return;var p=(vid.currentTime/vid.duration)*100;fill.style.width=p+'%';dot.style.left=p+'%';tcur.textContent=fTime(vid.currentTime);tdur.textContent=fTime(vid.duration);checkSkip(vid.currentTime)};
vid.onprogress=function(){if(vid.buffered.length>0)buf.style.width=(vid.buffered.end(vid.buffered.length-1)/vid.duration)*100+'%'};
var swiping=false,swipeStartX=0,swipeStartTime=0;
function seekFromEvent(clientX){var r=pbarWrap.getBoundingClientRect();vid.currentTime=Math.max(0,Math.min(vid.duration,((clientX-r.left)/r.width)*vid.duration))}
pbarWrap.onclick=function(e){e.stopPropagation();seekFromEvent(e.clientX);startHide()};
pbarWrap.onmousemove=function(e){var r=pbarWrap.getBoundingClientRect();var p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));tip.textContent=fTime(p*vid.duration);tip.style.left=(e.clientX-r.left)+'px'};
pbarWrap.addEventListener('touchstart',function(e){e.preventDefault();touchSeeking=true;pbarWrap.classList.add('touching');seekFromEvent(e.touches[0].clientX);startHide()},{passive:false});
pbarWrap.addEventListener('touchmove',function(e){e.preventDefault();if(!touchSeeking)return;seekFromEvent(e.touches[0].clientX);var r=pbarWrap.getBoundingClientRect();var p=Math.max(0,Math.min(1,(e.touches[0].clientX-r.left)/r.width));fill.style.width=(p*100)+'%';dot.style.left=(p*100)+'%';tip.textContent=fTime(p*vid.duration);tip.style.left=Math.max(0,Math.min(r.width,e.touches[0].clientX-r.left))+'px'},{passive:false});
pbarWrap.addEventListener('touchend',function(e){touchSeeking=false;pbarWrap.classList.remove('touching');startHide()});
vid.addEventListener('touchstart',function(e){if(e.target!==vid)return;swiping=true;swipeStartX=e.touches[0].clientX;swipeStartTime=vid.currentTime},{passive:true});
vid.addEventListener('touchmove',function(e){if(!swiping)return;var dx=e.touches[0].clientX-swipeStartX;var dur=vid.duration||600;var seekAmt=(dx/window.innerWidth)*dur;vid.currentTime=Math.max(0,Math.min(dur,swipeStartTime+seekAmt));var sec=Math.round(seekAmt);if(sec!==0)showToast((sec>0?'+':'')+sec+'s')},{passive:true});
vid.addEventListener('touchend',function(e){swiping=false;startHide()});
volRange.oninput=function(e){e.stopPropagation();vid.volume=parseFloat(this.value);vid.muted=false;updVol()};
muteBtn.onclick=function(e){e.stopPropagation();vid.muted=!vid.muted;updVol()};
function updVol(){muteBtn.innerHTML=(vid.muted||vid.volume===0)?'<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 8.5v2.14l2.45 2.45c.05-.2.05-.41.05-.59zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>':'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06A9 9 0 0014 3.23z"/>'}
fsBtn.onclick=function(e){e.stopPropagation();document.fullscreenElement?document.exitFullscreen():box.requestFullscreen()};
document.onfullscreenchange=function(){if(document.fullscreenElement){fsBtn.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';topbar.classList.add('hide');if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(function(){})}else{fsBtn.innerHTML='<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';topbar.classList.remove('hide')}};
pipBtn.onclick=function(e){e.stopPropagation();document.pictureInPictureElement?document.exitPictureInPicture():vid.requestPictureInPicture().catch(function(){})};
document.getElementById('skipBack').onclick=function(e){e.stopPropagation();vid.currentTime=Math.max(0,vid.currentTime-10);showToast('-10s');startHide()};
document.getElementById('skipFwd').onclick=function(e){e.stopPropagation();vid.currentTime=Math.min(vid.duration,vid.currentTime+10);showToast('+10s');startHide()};
function startHide(){clearTimeout(curTimer);ctrls.classList.remove('hide');box.classList.remove('hidecur');if(!vid.paused)curTimer=setTimeout(function(){ctrls.classList.add('hide');box.classList.add('hidecur')},3500)}
box.addEventListener('mousemove',startHide);
box.addEventListener('mouseleave',function(){clearTimeout(curTimer);if(!vid.paused)curTimer=setTimeout(function(){ctrls.classList.add('hide');box.classList.add('hidecur')},1000)});
box.addEventListener('touchstart',function(){if(vid.paused)return;startHide()},{passive:true});
box.ondblclick=function(e){if(e.target===vid||e.target===box)fsBtn.click()};
document.onkeydown=function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;switch(e.key){case' ':e.preventDefault();togglePlay();startHide();break;case'ArrowLeft':e.preventDefault();vid.currentTime=Math.max(0,vid.currentTime-10);showToast('-10s');startHide();break;case'ArrowRight':e.preventDefault();vid.currentTime=Math.min(vid.duration,vid.currentTime+10);showToast('+10s');startHide();break;case'ArrowUp':e.preventDefault();vid.volume=Math.min(1,vid.volume+0.1);volRange.value=vid.volume;showToast(Math.round(vid.volume*100)+'%');startHide();break;case'ArrowDown':e.preventDefault();vid.volume=Math.max(0,vid.volume-0.1);volRange.value=vid.volume;showToast(Math.round(vid.volume*100)+'%');startHide();break;case'f':case'F':fsBtn.click();break;case'm':case'M':muteBtn.click();break}};
var skipShown=false;
function checkSkip(t){if(introData&&t>=introData.start&&t<introData.end&&!skipShown){skipbtn.innerHTML='SKIP INTRO &#9654;';skipbtn.classList.add('show');skipShown=true;skipbtn.onclick=function(){vid.currentTime=introData.end;skipbtn.classList.remove('show');skipShown=false;showToast('Intro Skipped')}}else if(outroData&&t>=outroData.start&&t<outroData.end&&!skipShown){skipbtn.innerHTML='SKIP OUTRO &#9654;';skipbtn.classList.add('show');skipShown=true;skipbtn.onclick=function(){vid.currentTime=outroData.end;skipbtn.classList.remove('show');skipShown=false;showToast('Outro Skipped')}}else if(skipShown){var done=false;if(introData&&t>=introData.end)done=true;if(outroData&&t>=outroData.end)done=true;if(!introData&&!outroData)done=true;if(done){skipbtn.classList.remove('show');skipShown=false}}}
function fTime(s){if(!s||isNaN(s))return'0:00';var m=Math.floor(s/60);var sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
function showToast(m){toastEl.textContent=m;toastEl.classList.add('show');setTimeout(function(){toastEl.classList.remove('show')},1400)}
})();
</script></body></html>`;
}
module.exports = async (req, res) => {
  const ERR_MSG = "Invalid or non-existent MAL ID. Please check the MAL ID and try again.";
  const ERR_404 = "This anime was not found on our source. It may not have episodes uploaded yet.";

  // CORS - allow all origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, "");

    // Secure m3u8 Proxy (hides real URL via token): /api/mpxs/{hash}
    const mpxsMatch = path.match(/^\/api\/mpxs\/(\w+)$/);
    if (mpxsMatch) {
      const hash = mpxsMatch[1];
      const entry = m3u8Get(hash);
      if (!entry) return res.status(404).json({ error: "Invalid or expired token" });
      const targetUrl = typeof entry === 'string' ? entry : entry.url;
      const isAnizone = targetUrl.includes("xin-cdn.xyz") || targetUrl.includes("vid-cdn.xyz");
      const proxyHeaders = isAnizone ? ANIZONE_HEADERS : MEGAPLAY_HEADERS;
      try {
        const r = await fetch(targetUrl, { headers: proxyHeaders, redirect: "follow", agent: keepAliveAgent });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream " + r.status });
        const ct = r.headers.get("content-type") || "application/octet-stream";
        if (ct.includes("mpegurl") || targetUrl.split("?")[0].endsWith(".m3u8")) {
          const body = await r.text();
          const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          function absUrl(p, t, b) { return p.startsWith("http") ? p : (p.startsWith("/") ? new URL(t).origin + p : b + p); }
          const rewritten = body.replace(/^(?!#)([^\s].+)$/gm, (line) => {
            const abs = absUrl(line, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = stableHash("p", abs);
              m3u8Set(h, abs);
              return "/api/mpxs/" + h;
            }
            return "/api/mpxy?url=" + encodeURIComponent(abs);
          }).replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = absUrl(uri, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = stableHash("p", abs);
              m3u8Set(h, abs);
              return 'URI="/api/mpxs/' + h + '"';
            }
            return 'URI="/api/mpxy?url=' + encodeURIComponent(abs) + '"';
          });
          res.setHeader("Content-Type", "application/x-mpegURL");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
          prefetchManifestSegments(rewritten, proxyHeaders);
          return res.send(rewritten);
        }
        res.setHeader("Content-Type", ct);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const nodeStream = Readable.fromWeb(r.body);
        nodeStream.pipe(res);
        return;
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
      const isAnizone = targetUrl.includes("xin-cdn.xyz") || targetUrl.includes("vid-cdn.xyz");
      const proxyHeaders = isAnizone ? ANIZONE_HEADERS : MEGAPLAY_HEADERS;
      try {
        const r = await fetch(targetUrl, { headers: proxyHeaders, redirect: "follow", agent: keepAliveAgent });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream " + r.status });
        const ct = r.headers.get("content-type") || "application/octet-stream";

        if (ct.includes("mpegurl") || targetUrl.split("?")[0].endsWith(".m3u8")) {
          const body = await r.text();
          const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          function absUrl(p, t, b) { return p.startsWith("http") ? p : (p.startsWith("/") ? new URL(t).origin + p : b + p); }
          const rewritten = body.replace(/^(?!#)([^\s].+)$/gm, (line) => {
            const abs = absUrl(line, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = stableHash("p", abs);
              m3u8Set(h, abs);
              return "/api/mpxs/" + h;
            }
            return "/api/mpxy?url=" + encodeURIComponent(abs);
          }).replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = absUrl(uri, targetUrl, base);
            if (abs.includes(".m3u8")) {
              const h = stableHash("p", abs);
              m3u8Set(h, abs);
              return 'URI="/api/mpxs/' + h + '"';
            }
            return 'URI="/api/mpxy?url=' + encodeURIComponent(abs) + '"';
          });
          res.setHeader("Content-Type", "application/x-mpegURL");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
          prefetchManifestSegments(rewritten, proxyHeaders);
          return res.send(rewritten);
        }

        res.setHeader("Content-Type", ct);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const nodeStream = Readable.fromWeb(r.body);
        nodeStream.pipe(res);
        return;
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
          headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" },
          agent: keepAliveAgent
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
          headers: { "User-Agent": UA, "Referer": "https://toonstream.vip/" },
          agent: keepAliveAgent
        });
        if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });

        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        const nodeStream = Readable.fromWeb(r.body);
        nodeStream.pipe(res);
        return;
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

    // Cover image: /api/cover/:malId
    const coverMatch = path.match(/^\/api\/cover\/(\d+)$/);
    if (coverMatch) {
      const mid = parseInt(coverMatch[1]);
      try {
        const info = await jikanInfo(mid);
        const bgImage = await getCoverImage(info.title);
        return res.setHeader("Content-Type","application/json").send(JSON.stringify({ image: bgImage || null }));
      } catch (e) {
        return res.setHeader("Content-Type","application/json").send(JSON.stringify({ image: null }));
      }
    }

    // MegaPlay Player: /api/player/:mal_id/:season/:episode (3-param)
    const megaPlayer3 = path.match(/^\/api\/player\/(\d+)\/(\d+)\/(\d+)$/);
    if (megaPlayer3) {
      const mid = parseInt(megaPlayer3[1]);
      const ep = parseInt(megaPlayer3[3]);
      const type = url.searchParams.get("type") || "sub";
      try {
        const info = await jikanInfo(mid);
        const result = await extractMegaPlayByMal(mid, ep, type);
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
        const result = await extractMegaPlayByMal(mid, ep, type);
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
        const hash = stableHash("az", slug, ep);
        m3u8Set(hash, data.videoUrl);
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
        const hash = stableHash("ak", aid, ep, audioType);
        m3u8Set(hash, data.videoUrl);
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
          const html = renderEmbedOnly(preloaded, tracks, "EP" + decoded.ep, null, null, null, decoded.malId);
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
            const html = renderEmbedOnly(r.m3u8, r.tracks || [], "EP" + decoded.ep, r.intro || null, r.outro || null, null, decoded.malId);
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
      const html = renderEmbedOnly(m3u8, tracks, title + " [" + type.toUpperCase() + "] EP" + epNum, intro, outro, null, malId);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
    }

    // ====== NEW ANILIST-BASED ENDPOINTS ======

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
          const hash = stableHash("az", azResult.videoUrl);
          m3u8Set(hash, azResult.videoUrl);
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
