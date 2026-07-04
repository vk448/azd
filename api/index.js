const BASE = "https://9anime.org.lv/";
const AJAX = "https://9anime.org.lv/wp-admin/admin-ajax.php";
const JIKAN = "https://api.jikan.moe/v4";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

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
.ep-row:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,170,0,0.15);transform:translateX(4px)}
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
<div class="ep-list">${epRows.join("")}</div>
</div>
<div class="back-section"><a href="https://animezilla.vercel.app" class="back-btn"><i class="fas fa-arrow-left"></i> Back to Website</a></div>
</div>
<div class="footer"><p>Powered by <a href="https://animezilla.vercel.app">AnimeZilla</a></p></div>
</div>
</body></html>`;
}

module.exports = async (req, res) => {
  const ERR_MSG = "Invalid or non-existent MAL ID. Please check the MAL ID and try again.";
  const ERR_404 = "This anime was not found on our source. It may not have episodes uploaded yet.";

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, "");

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

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
