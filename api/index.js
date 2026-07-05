const BASE = "https://9anime.org.lv/";
const AJAX = "https://9anime.org.lv/wp-admin/admin-ajax.php";
const JIKAN = "https://api.jikan.moe/v4";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const { spawn } = require("child_process");

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
<div class="info-title">${name} — Season ${season}, Episode ${ep}</div>
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
  hls=new Hls({maxBufferLength:30,startLevel:-1,enableWorker:true,lowLatencyMode:false});
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

module.exports = async (req, res) => {
  const ERR_MSG = "Invalid or non-existent MAL ID. Please check the MAL ID and try again.";
  const ERR_404 = "This anime was not found on our source. It may not have episodes uploaded yet.";

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, "");

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
        res.setHeader("Cache-Control", "public, max-age=3600");

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

    // HLS Player: /api/player/:mal_id/:season/:episode (3-param, legacy)
    const playerMatch3 = path.match(/^\/api\/player\/(\d+)\/(\d+)\/(\d+)$/);
    // HLS Player: /api/player/:mal_id/:episode (2-param, auto-detect season)
    const playerMatch2 = path.match(/^\/api\/player\/(\d+)\/(\d+)$/);
    if (playerMatch3 || playerMatch2) {
      const mid = parseInt(playerMatch3 ? playerMatch3[1] : playerMatch2[1]);
      const ep = parseInt(playerMatch3 ? playerMatch3[3] : playerMatch2[2]);
      const manualSeason = playerMatch3 ? parseInt(playerMatch3[2]) : null;

      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError("Invalid MAL ID")); }
      const title = info.title;

      const cached = await findAnimeByTitle(title);
      let tvmSeasons = [];
      if (cached?.seasons) {
        tvmSeasons = Object.values(cached.seasons).map(s => ({ number: s.seasonNumber, episodes: s.totalEpisodes || 0 }));
      } else {
        tvmSeasons = await getTvmazeSeasons(title);
      }

      const slug = toonSlug(title);

      let season = manualSeason;
      if (!season) {
        season = await detectSeasonFromMalId(mid, title);
      }

      // Get m3u8 via FirePlayer API
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
        return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(`Episode S${season}E${ep} stream not available`));
      }

      // ToonStream episode page as download source
      const toonStreamUrl = `https://toonstream.vip/episode/${slug}-${season}x${ep}/`;
      let subUrl = toonStreamUrl;
      let dubUrl = "";

      const curSeason = tvmSeasons.find(s => s.number === season) || {};
      const totalEps = curSeason.episodes || 25;
      const maxSeason = tvmSeasons.length ? Math.max(...tvmSeasons.map(s => s.number)) : season;

      global._playerMid = mid;
      global._playerTotalEps = totalEps;
      global._playerMaxSeason = maxSeason;

      const img = info.image || "";
      const html = renderPlayer(title, season, ep, m3u8Url, img, subUrl, dubUrl);
      return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
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

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
