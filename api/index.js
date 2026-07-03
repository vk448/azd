const BASE = "https://9anime.org.lv/";
const AJAX = "https://9anime.org.lv/wp-admin/admin-ajax.php";
const JIKAN = "https://api.jikan.moe/v4";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function slugify(t) {
  return t.toLowerCase().replace(/[:'"()]/g, "").replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function jikanInfo(id) {
  const r = await fetch(`${JIKAN}/anime/${id}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`MAL_API_ERROR`);
  const d = await r.json();
  return { title: d.data?.title || "", eng: d.data?.title_english || d.data?.title || "" };
}

async function findMalId(title) {
  const r = await fetch(`${BASE}${slugify(title)}-episode-1/`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const h = await r.text();
  const m = h.match(/var malId\s*=\s*["'](\d+)/);
  return m ? m[1] : null;
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

function renderError(msg) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AnimeZilla - Error</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;min-height:100vh;background:#08080c;color:#fff;overflow-x:hidden;display:flex;align-items:center;justify-content:center}
.animated-bg{position:fixed;inset:0;z-index:0;background:linear-gradient(135deg,#0a0a12 0%,#1a0a2e 30%,#0d1b2a 60%,#08080c 100%);overflow:hidden}
.animated-bg::before{content:'';position:absolute;width:600px;height:600px;background:radial-gradient(circle,rgba(124,58,237,0.08) 0%,transparent 70%);top:-200px;right:-200px;animation:float 8s ease-in-out infinite}
.animated-bg::after{content:'';position:absolute;width:500px;height:500px;background:radial-gradient(circle,rgba(168,85,247,0.06) 0%,transparent 70%);bottom:-150px;left:-150px;animation:float 10s ease-in-out infinite reverse}
@keyframes float{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-30px)}}
.page{position:relative;z-index:10;text-align:center;padding:40px 24px;max-width:420px;width:100%}
.logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:40px;text-decoration:none}
.logo-icon{width:48px;height:48px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 8px 32px rgba(124,58,237,0.35);animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 8px 32px rgba(124,58,237,0.35)}50%{box-shadow:0 8px 48px rgba(124,58,237,0.55)}}
.logo-text{font-size:26px;font-weight:900;background:linear-gradient(135deg,#c084fc,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.error-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:24px;padding:48px 32px;backdrop-filter:blur(20px);animation:slideUp .6s ease-out}
@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.error-icon{width:80px;height:80px;margin:0 auto 24px;border-radius:50%;background:linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05));border:2px solid rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;font-size:36px;color:#ef4444;animation:scaleIn .4s ease-out .2s both}
@keyframes scaleIn{from{transform:scale(0.5);opacity:0}to{transform:scale(1);opacity:1}}
.error-title{font-size:22px;font-weight:800;margin-bottom:10px;color:#fff}
.error-msg{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:28px}
.error-hint{display:inline-flex;align-items:center;gap:8px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:12px 20px;font-size:13px;color:#c084fc;font-weight:600;text-decoration:none;transition:all .3s}
.error-hint:hover{background:rgba(124,58,237,0.2);border-color:rgba(124,58,237,0.35);transform:translateY(-2px)}
.footer{position:relative;z-index:10;text-align:center;padding:20px;font-size:11px;color:rgba(255,255,255,0.12)}
.footer a{color:#7c3aed;text-decoration:none}
</style></head><body>
<div class="animated-bg"></div>
<div class="page">
<div class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></div>
<div class="error-card">
<div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
<h1 class="error-title">Oops! Something went wrong</h1>
<p class="error-msg">${msg}</p>
<a href="/" class="error-hint"><i class="fas fa-arrow-left"></i> Back to Home</a>
</div>
</div>
<div class="footer">Powered by <a href="/">AnimeZilla</a></div>
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
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;min-height:100vh;background:#08080c;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}

.bg-layer{position:fixed;inset:0;z-index:0}
.bg-layer img{width:100%;height:100%;object-fit:cover;filter:blur(50px) brightness(0.2) saturate(1.6);transform:scale(1.4)}
.bg-layer::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,12,0.1) 0%,rgba(8,8,12,0.5) 30%,rgba(8,8,12,0.85) 65%,#08080c 100%)}
.bg-overlay{position:fixed;inset:0;z-index:1;background:radial-gradient(ellipse at 50% 30%,rgba(124,58,237,0.08) 0%,transparent 60%)}

.page{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column}

.header{padding:20px 24px;display:flex;align-items:center}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 20px rgba(124,58,237,0.4)}
.logo-text{font-size:22px;font-weight:900;background:linear-gradient(135deg,#c084fc,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}

.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px 40px;max-width:480px;margin:0 auto;width:100%}

.poster-wrap{position:relative;margin-bottom:32px;animation:su .6s ease-out}
.poster-glow{position:absolute;inset:-25px;background:radial-gradient(circle,rgba(124,58,237,0.3) 0%,transparent 70%);z-index:-1;filter:blur(25px);animation:glow 4s ease-in-out infinite alternate}
@keyframes glow{from{opacity:0.6;transform:scale(0.95)}to{opacity:1;transform:scale(1.05)}}
.poster{width:190px;height:270px;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.75),0 0 0 1px rgba(255,255,255,0.08),0 0 60px rgba(124,58,237,0.15)}
.poster img{width:100%;height:100%;object-fit:cover;transition:transform .4s}
.poster:hover img{transform:scale(1.05)}

.ep-badge{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.15));border:1px solid rgba(124,58,237,0.35);color:#d8b4fe;font-size:12px;font-weight:700;padding:8px 18px;border-radius:30px;margin-bottom:18px;backdrop-filter:blur(12px);animation:su .5s ease-out .1s both;letter-spacing:0.5px}

.title{font-size:26px;font-weight:800;text-align:center;line-height:1.2;margin-bottom:8px;text-shadow:0 4px 40px rgba(0,0,0,0.7);animation:su .5s ease-out .15s both}

.meta{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:40px;display:flex;align-items:center;gap:14px;animation:su .5s ease-out .2s both}
.meta span{display:flex;align-items:center;gap:6px}
.dot{width:3px;height:3px;background:rgba(255,255,255,0.25);border-radius:50%}

.dl-section{width:100%;animation:su .5s ease-out .25s both}
.dl-label{font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;padding-left:4px}

.dl-btn{display:flex;align-items:center;gap:14px;width:100%;padding:20px 24px;border-radius:18px;font-size:15px;font-weight:700;text-decoration:none;transition:all .35s cubic-bezier(.4,0,.2,1);margin-bottom:14px;position:relative;overflow:hidden}
.dl-btn:active{transform:scale(0.97)}

.dl-btn.sub{background:linear-gradient(135deg,#7c3aed 0%,#9333ea 50%,#a855f7 100%);color:#fff;box-shadow:0 10px 40px rgba(124,58,237,0.4),inset 0 1px 0 rgba(255,255,255,0.15)}
.dl-btn.sub:hover{transform:translateY(-4px);box-shadow:0 16px 50px rgba(124,58,237,0.55),inset 0 1px 0 rgba(255,255,255,0.2)}
.dl-btn.sub::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.1),transparent);opacity:0;transition:opacity .3s}
.dl-btn.sub:hover::before{opacity:1}

.dl-btn.dub{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px)}
.dl-btn.dub:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.3)}

.dl-btn.disabled{opacity:0.3;cursor:not-allowed;pointer-events:none}

.dl-icon{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.sub .dl-icon{background:rgba(255,255,255,0.18)}
.dub .dl-icon{background:rgba(255,255,255,0.06)}

.dl-info{flex:1}
.dl-info .main-text{display:block;font-size:15px;font-weight:700}
.dl-info .sub-text{display:block;font-size:12px;font-weight:500;opacity:0.55;margin-top:3px}

.dl-arrow{font-size:16px;opacity:0.35;transition:all .3s}
.dl-btn:hover .dl-arrow{transform:translateX(5px);opacity:0.8}

.footer{padding:30px 24px;text-align:center;animation:su .5s ease-out .35s both}
.footer p{font-size:12px;color:rgba(255,255,255,0.12)}
.footer a{color:#7c3aed;text-decoration:none;font-weight:600}

@keyframes su{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:480px){.title{font-size:22px}.poster{width:160px;height:228px}.dl-btn{padding:18px 20px}}
</style></head><body>
<div class="bg-layer"><img src="${img}" alt=""></div>
<div class="bg-overlay"></div>
<div class="page">
<div class="header"><a href="/" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a></div>
<div class="main">
<div class="poster-wrap"><div class="poster-glow"></div><div class="poster"><img src="${img}" alt="${name}"></div></div>
<div class="ep-badge"><i class="fas fa-play-circle"></i> Episode ${ep}</div>
<h1 class="title">${name}</h1>
<div class="meta"><span><i class="fas fa-tv"></i> Episode ${ep}</span><div class="dot"></div><span><i class="fas fa-signal"></i> 1080p</span><div class="dot"></div><span><i class="fas fa-closed-captioning"></i> Sub/Dub</span></div>
<div class="dl-section"><div class="dl-label">Download</div>${makeBtn(subUrl, "sub", "SUB", "Subtitle (Default)")}${makeBtn(dubUrl, "dub", "DUB", "English Dubbed (Default)")}</div>
</div>
<div class="footer"><p>Powered by <a href="/">AnimeZilla</a></p></div>
</div>
</body></html>`;
}

module.exports = async (req, res) => {
  const ERR_MSG = "Invalid or non-existent MAL ID. Please check the MAL ID and try again.";
  const ERR_404 = "This anime was not found on our source. It may not have episodes uploaded yet.";

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/\/+$/, "");

    const malMatch = path.match(/^\/api\/mal\/(\d+)\/page$/);
    if (malMatch) {
      const mid = parseInt(malMatch[1]);
      const ep = parseInt(url.searchParams.get("episode") || "1");
      let info;
      try { info = await jikanInfo(mid); } catch { return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_MSG)); }
      const name = info.eng || info.title;
      const imid = await findMalId(name);
      if (!imid) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_404));
      let subUrl = "", dubUrl = "";
      const dl = await ajaxDL(imid, ep);
      if (dl?.data && dl.data.status === 200) {
        const dls = parseDL(dl.data.result || "");
        subUrl = dls.sub[0]?.url || "";
        dubUrl = dls.dub[0]?.url || "";
      }
      const img = await getImg(name, ep);
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
      const imid = await findMalId(name);
      if (!imid) return res.status(404).json({ error: ERR_404 });
      const dl = await ajaxDL(imid, ep);
      if (!dl?.data || dl.data.status !== 200) return res.status(404).json({ error: "No download links available for this episode." });
      const dls = parseDL(dl.data.result || "");
      return res.status(200).json({ anime: name, episode: ep, mal_id: imid, downloads: { subtitled: dls.sub, dubbed: dls.dub } });
    }

    if (path === "/api/page") {
      const title = url.searchParams.get("title");
      const ep = parseInt(url.searchParams.get("episode") || "1");
      if (!title) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError("Please provide a valid anime title."));
      const imid = await findMalId(title);
      if (!imid) return res.setHeader("Content-Type","text/html;charset=UTF-8").send(renderError(ERR_404));
      let subUrl = "", dubUrl = "";
      const dl = await ajaxDL(imid, ep);
      if (dl?.data && dl.data.status === 200) {
        const dls = parseDL(dl.data.result || "");
        subUrl = dls.sub[0]?.url || "";
        dubUrl = dls.dub[0]?.url || "";
      }
      const img = await getImg(title, ep);
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
      const imid = await findMalId(name);
      if (!imid) return res.status(404).json({ error: ERR_404 });
      const dl = await ajaxDL(imid, ep);
      if (!dl?.data || dl.data.status !== 200) return res.status(404).json({ error: "No download links available for this episode." });
      const dls = parseDL(dl.data.result || "");
      return res.status(200).json({ anime: name, episode: ep, mal_id: imid, downloads: { subtitled: dls.sub, dubbed: dls.dub } });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
