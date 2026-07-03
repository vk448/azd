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
  if (!r.ok) throw new Error(`MAL API error: ${r.status}`);
  const d = await r.json();
  return { title: d.data?.title || "", eng: d.data?.title_english || d.data?.title || "", episodes: d.data?.episodes || 0 };
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

function renderPage(name, ep, img, subUrl, dubUrl) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${name} Episode ${ep} - AnimeZilla</title><meta name="description" content="Download ${name} Episode ${ep}"><meta property="og:title" content="${name} Episode ${ep} - AnimeZilla"><meta property="og:image" content="${img}"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;min-height:100vh;background:#08080c;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}.bg{position:fixed;inset:0;z-index:0}.bg img{width:100%;height:100%;object-fit:cover;filter:blur(40px) brightness(0.25) saturate(1.5);transform:scale(1.3)}.bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,12,0.3) 0%,rgba(8,8,12,0.7) 40%,rgba(8,8,12,0.95) 70%,#08080c 100%)}.page{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column}.header{padding:20px 24px;display:flex;align-items:center}.logo{display:flex;align-items:center;gap:10px;text-decoration:none}.logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 20px rgba(124,58,237,0.4)}.logo-text{font-size:22px;font-weight:900;background:linear-gradient(135deg,#c084fc,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px 40px;max-width:480px;margin:0 auto;width:100%}.poster-wrap{position:relative;margin-bottom:28px;animation:su .5s ease-out}.poster{width:180px;height:254px;border-radius:20px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.06)}.poster img{width:100%;height:100%;object-fit:cover}.poster-glow{position:absolute;inset:-20px;background:radial-gradient(circle,rgba(124,58,237,0.25) 0%,transparent 70%);z-index:-1;filter:blur(20px)}.ep-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.3);color:#c084fc;font-size:12px;font-weight:700;padding:7px 16px;border-radius:30px;margin-bottom:16px;backdrop-filter:blur(10px);animation:su .5s ease-out .1s both}.title{font-size:24px;font-weight:800;text-align:center;line-height:1.25;margin-bottom:6px;text-shadow:0 4px 30px rgba(0,0,0,0.6);animation:su .5s ease-out .15s both}.meta{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:36px;display:flex;align-items:center;gap:12px;animation:su .5s ease-out .2s both}.meta span{display:flex;align-items:center;gap:5px}.dot{width:3px;height:3px;background:rgba(255,255,255,0.2);border-radius:50%}.dl-section{width:100%;animation:su .5s ease-out .25s both}.dl-label{font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:2.5px;text-transform:uppercase;margin-bottom:14px;padding-left:4px}.dl-btn{display:flex;align-items:center;gap:14px;width:100%;padding:18px 22px;border-radius:16px;font-size:15px;font-weight:700;text-decoration:none;transition:all .3s;margin-bottom:12px;position:relative;overflow:hidden}.dl-btn:active{transform:scale(0.98)}.dl-btn.sub{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 8px 32px rgba(124,58,237,0.4)}.dl-btn.sub:hover{transform:translateY(-3px);box-shadow:0 14px 44px rgba(124,58,237,0.5)}.dl-btn.dub{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.08)}.dl-btn.dub:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15);transform:translateY(-3px)}.dl-btn.disabled{opacity:0.35;cursor:not-allowed;pointer-events:none}.dl-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}.sub .dl-icon{background:rgba(255,255,255,0.15)}.dub .dl-icon{background:rgba(255,255,255,0.06)}.dl-info{flex:1}.dl-info .main-text{display:block;font-size:15px;font-weight:700}.dl-info .sub-text{display:block;font-size:12px;font-weight:500;opacity:0.6;margin-top:2px}.dl-arrow{font-size:16px;opacity:0.4;transition:transform .3s}.dl-btn:hover .dl-arrow{transform:translateX(4px);opacity:0.7}.footer{padding:30px 24px;text-align:center;animation:su .5s ease-out .35s both}.footer p{font-size:12px;color:rgba(255,255,255,0.15)}.footer a{color:#7c3aed;text-decoration:none;font-weight:600}@keyframes su{from{opacity:0;transform:translateY(25px)}to{opacity:1;transform:translateY(0)}}@media(max-width:480px){.title{font-size:20px}.poster{width:150px;height:212px}.dl-btn{padding:16px 18px}}</style></head><body><div class="bg"><img src="${img}" alt=""></div><div class="page"><div class="header"><a href="/" class="logo"><div class="logo-icon"><i class="fas fa-bolt"></i></div><span class="logo-text">AnimeZilla</span></a></div><div class="main"><div class="poster-wrap"><div class="poster-glow"></div><div class="poster"><img src="${img}" alt="${name}"></div></div><div class="ep-badge"><i class="fas fa-play-circle"></i> Episode ${ep}</div><h1 class="title">${name}</h1><div class="meta"><span><i class="fas fa-tv"></i> Episode ${ep}</span><div class="dot"></div><span><i class="fas fa-signal"></i> 1080p</span><div class="dot"></div><span><i class="fas fa-closed-captioning"></i> Sub/Dub</span></div><div class="dl-section"><div class="dl-label">Download</div>${makeBtn(subUrl, "sub", "SUB", "Subtitle (Default)")}${makeBtn(dubUrl, "dub", "DUB", "English Dubbed (Default)")}</div></div><div class="footer"><p>Powered by <a href="/">AnimeZilla</a></p></div></div></body></html>`;
}

module.exports = async (req, res) => {
  try {
    const mid = parseInt(req.query.id);
    const ep = parseInt(req.query.episode || "1");
    if (!mid) return res.status(400).json({ error: "mal_id required" });

    const info = await jikanInfo(mid);
    const name = info.eng || info.title;
    const imid = await findMalId(name);
    if (!imid) return res.status(404).json({ error: "Anime not found on 9anime" });

    let subUrl = "";
    let dubUrl = "";
    const dl = await ajaxDL(imid, ep);
    if (dl?.data && dl.data.status === 200) {
      const dls = parseDL(dl.data.result || "");
      subUrl = dls.sub[0]?.url || "";
      dubUrl = dls.dub[0]?.url || "";
    }

    const img = await getImg(name, ep);
    const html = renderPage(name, ep, img, subUrl, dubUrl);
    return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
