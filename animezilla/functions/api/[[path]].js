const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ANIME_NAME}} Episode {{EPISODE}} - AnimeZilla</title>
    <meta name="description" content="Download {{ANIME_NAME}} Episode {{EPISODE}} in Sub and Dub on AnimeZilla">
    <meta property="og:title" content="{{ANIME_NAME}} Episode {{EPISODE}} - AnimeZilla">
    <meta property="og:description" content="Download {{ANIME_NAME}} Episode {{EPISODE}}">
    <meta property="og:image" content="{{IMAGE_URL}}">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Inter',sans-serif;min-height:100vh;background:#08080c;color:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        .bg{position:fixed;inset:0;z-index:0}
        .bg img{width:100%;height:100%;object-fit:cover;filter:blur(40px) brightness(0.25) saturate(1.5);transform:scale(1.3)}
        .bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,12,0.3) 0%,rgba(8,8,12,0.7) 40%,rgba(8,8,12,0.95) 70%,#08080c 100%)}
        .page{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column}
        .header{padding:20px 24px;display:flex;align-items:center;gap:12px}
        .logo{display:flex;align-items:center;gap:10px;text-decoration:none}
        .logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 20px rgba(124,58,237,0.4)}
        .logo-text{font-size:22px;font-weight:900;background:linear-gradient(135deg,#c084fc,#a855f7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.5px}
        .main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px 40px;max-width:480px;margin:0 auto;width:100%}
        .poster-wrap{position:relative;margin-bottom:28px;animation:slideUp .5s ease-out}
        .poster{width:180px;height:254px;border-radius:20px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.06)}
        .poster img{width:100%;height:100%;object-fit:cover}
        .poster-glow{position:absolute;inset:-20px;background:radial-gradient(circle,rgba(124,58,237,0.25) 0%,transparent 70%);z-index:-1;filter:blur(20px)}
        .ep-badge{display:inline-flex;align-items:center;gap:7px;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.3);color:#c084fc;font-size:12px;font-weight:700;padding:7px 16px;border-radius:30px;margin-bottom:16px;backdrop-filter:blur(10px);animation:slideUp .5s ease-out .1s both}
        .ep-badge i{font-size:11px}
        .title{font-size:24px;font-weight:800;text-align:center;line-height:1.25;margin-bottom:6px;text-shadow:0 4px 30px rgba(0,0,0,0.6);animation:slideUp .5s ease-out .15s both}
        .meta{font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:36px;display:flex;align-items:center;gap:12px;animation:slideUp .5s ease-out .2s both}
        .meta span{display:flex;align-items:center;gap:5px}
        .meta .dot{width:3px;height:3px;background:rgba(255,255,255,0.2);border-radius:50%}
        .dl-section{width:100%;animation:slideUp .5s ease-out .25s both}
        .dl-label{font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:2.5px;text-transform:uppercase;margin-bottom:14px;padding-left:4px}
        .dl-btn{display:flex;align-items:center;gap:14px;width:100%;padding:18px 22px;border-radius:16px;font-size:15px;font-weight:700;text-decoration:none;transition:all .3s cubic-bezier(.25,.8,.25,1);margin-bottom:12px;position:relative;overflow:hidden}
        .dl-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.08),transparent);opacity:0;transition:opacity .3s}
        .dl-btn:hover::before{opacity:1}
        .dl-btn:active{transform:scale(0.98)}
        .dl-btn.sub{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 8px 32px rgba(124,58,237,0.4),inset 0 1px 0 rgba(255,255,255,0.15)}
        .dl-btn.sub:hover{transform:translateY(-3px);box-shadow:0 14px 44px rgba(124,58,237,0.5),inset 0 1px 0 rgba(255,255,255,0.15)}
        .dl-btn.dub{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 20px rgba(0,0,0,0.15)}
        .dl-btn.dub:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15);transform:translateY(-3px)}
        .dl-btn.disabled{opacity:0.35;cursor:not-allowed;pointer-events:none}
        .dl-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sub .dl-icon{background:rgba(255,255,255,0.15)}
        .dub .dl-icon{background:rgba(255,255,255,0.06)}
        .dl-info{flex:1}
        .dl-info .main-text{display:block;font-size:15px;font-weight:700}
        .dl-info .sub-text{display:block;font-size:12px;font-weight:500;opacity:0.6;margin-top:2px}
        .dl-arrow{font-size:16px;opacity:0.4;transition:transform .3s}
        .dl-btn:hover .dl-arrow{transform:translateX(4px);opacity:0.7}
        .footer{padding:30px 24px;text-align:center;animation:slideUp .5s ease-out .35s both}
        .footer p{font-size:12px;color:rgba(255,255,255,0.15)}
        .footer a{color:#7c3aed;text-decoration:none;font-weight:600}
        @keyframes slideUp{from{opacity:0;transform:translateY(25px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:480px){.title{font-size:20px}.poster{width:150px;height:212px}.dl-btn{padding:16px 18px}}
    </style>
</head>
<body>
    <div class="bg"><img src="{{IMAGE_URL}}" alt=""></div>
    <div class="page">
        <div class="header">
            <a href="/" class="logo">
                <div class="logo-icon"><i class="fas fa-bolt"></i></div>
                <span class="logo-text">AnimeZilla</span>
            </a>
        </div>
        <div class="main">
            <div class="poster-wrap">
                <div class="poster-glow"></div>
                <div class="poster"><img src="{{IMAGE_URL}}" alt="{{ANIME_NAME}}"></div>
            </div>
            <div class="ep-badge"><i class="fas fa-play-circle"></i> Episode {{EPISODE}}</div>
            <h1 class="title">{{ANIME_NAME}}</h1>
            <div class="meta">
                <span><i class="fas fa-tv"></i> Episode {{EPISODE}}</span>
                <div class="dot"></div>
                <span><i class="fas fa-signal"></i> 1080p</span>
                <div class="dot"></div>
                <span><i class="fas fa-closed-captioning"></i> Sub/Dub</span>
            </div>
            <div class="dl-section">
                <div class="dl-label">Download</div>
                {{SUB_BUTTON}}
                {{DUB_BUTTON}}
            </div>
        </div>
        <div class="footer"><p>Powered by <a href="/">AnimeZilla</a></p></div>
    </div>
</body>
</html>`;

const BASE_URL = "https://9anime.org.lv/";
const AJAX_URL = "https://9anime.org.lv/wp-admin/admin-ajax.php";
const JIKAN_API = "https://api.jikan.moe/v4";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://9anime.org.lv/",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://9anime.org.lv",
};

function titleToSlug(title) {
    let slug = title.toLowerCase();
    slug = slug.replace(/[:'"()]/g, "");
    slug = slug.replace(/[^a-z0-9\s-]/g, "");
    slug = slug.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return slug;
}

async function fetchJSON(url, options = {}) {
    const resp = await fetch(url, { headers: HEADERS, ...options });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp;
}

async function getMalInfo(malId) {
    const resp = await fetchJSON(`${JIKAN_API}/anime/${malId}`);
    const data = await resp.json();
    return {
        mal_id: malId,
        title: data.data?.title || "",
        title_english: data.data?.title_english || data.data?.title || "",
        episodes: data.data?.episodes,
    };
}

async function findEpisodePage(title) {
    const slug = titleToSlug(title);
    const testUrl = `${BASE_URL}${slug}-episode-1/`;
    try {
        const resp = await fetch(testUrl, { headers: HEADERS });
        if (resp.ok) {
            const html = await resp.text();
            const match = html.match(/var malId\s*=\s*["'](\d+)/);
            if (match) return { url: testUrl, mal_id: match[1] };
        }
    } catch (e) {}
    return null;
}

async function fetchDownloadLinks(malId, ep) {
    const resp = await fetch(AJAX_URL, {
        method: "POST",
        headers: HEADERS,
        body: new URLSearchParams({
            action: "fetch_download_links",
            mal_id: malId,
            ep: ep,
        }),
    });
    return resp.json();
}

function parseDownloadHtml(html) {
    const result = { subtitled: [], dubbed: [] };
    const sectionHeaders = [...html.matchAll(/<div class="dl-section-header">[\s\S]*?<span class="dl-section-title">(.*?)<\/span>/g)];
    const bubbleRows = [...html.matchAll(/<div class="dl-bubble-row">([\s\S]*?)<\/div><\/div>/g)];

    for (let i = 0; i < sectionHeaders.length; i++) {
        const sectionType = sectionHeaders[i][1]?.trim().toUpperCase();
        const rowMatch = html.match(new RegExp(`<div class="dl-section-header">[\\s\\S]*?<span class="dl-section-title">${sectionHeaders[i][1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>[\\s\\S]*?<div class="dl-bubble-row">([\\s\\S]*?)</div></div>`));
        if (!rowMatch) continue;

        const links = [...rowMatch[1].matchAll(/<a href="([^"]+)"[^>]*class="dl-bubble-item"[^>]*>[\s\S]*?<span class="dl-bubble-text">(.*?)<\/span>/g)];
        for (const link of links) {
            const entry = { url: link[1], label: link[2]?.replace(/<[^>]+>/g, "").trim() || "Default", best: rowMatch[1].includes("dl-best-badge") };
            if (sectionType === "SUBTITLED") result.subtitled.push(entry);
            else if (sectionType === "DUBBED") result.dubbed.push(entry);
        }
    }
    return result;
}

async function fetchAnimeImage(animeName, episode) {
    const slug = titleToSlug(animeName);
    const url = `${BASE_URL}${slug}-episode-${episode}/`;
    try {
        const resp = await fetch(url, { headers: HEADERS });
        if (resp.ok) {
            const html = await resp.text();
            const match = html.match(/background-image:\s*url\('([^']+)'\)/);
            if (match) return match[1];
            const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
            if (ogMatch) return ogMatch[1];
        }
    } catch (e) {}
    return "";
}

function generateButtons(subUrl, dubUrl) {
    let subBtn = subUrl
        ? `<a href="${subUrl}" target="_blank" class="dl-btn sub"><div class="dl-icon"><i class="fas fa-closed-captioning"></i></div><div class="dl-info"><span class="main-text">Download SUB</span><span class="sub-text">Subtitle (Default)</span></div><i class="fas fa-chevron-right dl-arrow"></i></a>`
        : `<div class="dl-btn sub disabled"><div class="dl-icon"><i class="fas fa-closed-captioning"></i></div><div class="dl-info"><span class="main-text">SUB Unavailable</span><span class="sub-text">Not available yet</span></div></div>`;

    let dubBtn = dubUrl
        ? `<a href="${dubUrl}" target="_blank" class="dl-btn dub"><div class="dl-icon"><i class="fas fa-microphone"></i></div><div class="dl-info"><span class="main-text">Download DUB</span><span class="sub-text">English Dubbed (Default)</span></div><i class="fas fa-chevron-right dl-arrow"></i></a>`
        : `<div class="dl-btn dub disabled"><div class="dl-icon"><i class="fas fa-microphone"></i></div><div class="dl-info"><span class="main-text">DUB Unavailable</span><span class="sub-text">Not available yet</span></div></div>`;

    return { subBtn, dubBtn };
}

function renderTemplate(animeName, episode, imageUrl, subBtn, dubBtn) {
    return TEMPLATE
        .replace(/\{\{ANIME_NAME\}\}/g, animeName)
        .replace(/\{\{EPISODE\}\}/g, episode)
        .replace(/\{\{IMAGE_URL\}\}/g, imageUrl)
        .replace("{{SUB_BUTTON}}", subBtn)
        .replace("{{DUB_BUTTON}}", dubBtn);
}

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const path = url.pathname;

    if (path === "/api/page") {
        const title = url.searchParams.get("title");
        const episode = url.searchParams.get("episode") || "1";
        const sub = url.searchParams.get("sub") || "";
        const dub = url.searchParams.get("dub") || "";
        const image = url.searchParams.get("image") || "";

        if (!title) {
            return new Response(JSON.stringify({ error: "title is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const imageUrl = image || await fetchAnimeImage(title, parseInt(episode));
        const { subBtn, dubBtn } = generateButtons(sub, dub);
        const html = renderTemplate(title, episode, imageUrl, subBtn, dubBtn);

        return new Response(html, {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
    }

    const malMatch = path.match(/^\/api\/mal\/(\d+)\/page$/);
    if (malMatch) {
        const malId = parseInt(malMatch[1]);
        const episode = parseInt(url.searchParams.get("episode") || "1");

        try {
            const malInfo = await getMalInfo(malId);
            const animeName = malInfo.title_english || malInfo.title;

            const pageResult = await findEpisodePage(animeName);
            if (!pageResult) {
                return new Response(JSON.stringify({ error: "Anime not found on 9anime" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const ajaxData = await fetchDownloadLinks(pageResult.mal_id, episode);
            if (!ajaxData?.data || ajaxData.data.status !== 200) {
                return new Response(JSON.stringify({ error: "No download links available" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const downloads = parseDownloadHtml(ajaxData.data.result || "");
            const subUrl = downloads.subtitled[0]?.url || "";
            const dubUrl = downloads.dubbed[0]?.url || "";

            const imageUrl = await fetchAnimeImage(animeName, episode);
            const { subBtn, dubBtn } = generateButtons(subUrl, dubUrl);
            const html = renderTemplate(animeName, episode, imageUrl, subBtn, dubBtn);

            return new Response(html, {
                headers: { "Content-Type": "text/html;charset=UTF-8" },
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    if (path === "/api/mal" && url.searchParams.get("mal_id")) {
        const malId = parseInt(url.searchParams.get("mal_id"));
        const episode = parseInt(url.searchParams.get("episode") || "1");

        try {
            const malInfo = await getMalInfo(malId);
            const animeName = malInfo.title_english || malInfo.title;

            const pageResult = await findEpisodePage(animeName);
            if (!pageResult) {
                return new Response(JSON.stringify({ error: "Anime not found" }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const ajaxData = await fetchDownloadLinks(pageResult.mal_id, episode);
            const downloads = ajaxData?.data?.status === 200 ? parseDownloadHtml(ajaxData.data.result || "") : { subtitled: [], dubbed: [] };

            return new Response(JSON.stringify({
                anime: animeName,
                episode,
                mal_id: pageResult.mal_id,
                downloads,
            }), {
                headers: { "Content-Type": "application/json" },
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    return new Response(JSON.stringify({
        name: "AnimeZilla API",
        endpoints: {
            "GET /api/mal/{mal_id}/page?episode=N": "Landing page by MAL ID",
            "GET /api/page?title=...&episode=N&sub=URL&dub=URL": "Custom landing page",
            "GET /api/mal?mal_id=N&episode=N": "Download links JSON",
        },
    }), {
        headers: { "Content-Type": "application/json" },
    });
}
