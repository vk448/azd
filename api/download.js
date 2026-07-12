const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const WORKER_DOMAINS = [
  "official9animedownloader.workerforcloud.workers.dev",
  "official9animedownloader.workerforcloud3.workers.dev",
  "official9animedownloader2.workerforcloud2.workers.dev",
];

function buildWorkerUrl(code) {
  return WORKER_DOMAINS.map(d => `https://${d}/${code}`);
}

function buildAnimeUrl(slug, episode) {
  return `https://9anime.org.lv/${slug}-episode-${episode}/`;
}

function parseDownloadHtml(html) {
  const result = { sub: [], dub: [] };
  let currentSection = "sub";

  const sections = html.split(/<div class="dl-section-header">/);
  for (const section of sections) {
    if (section.includes("SUBTITLED")) currentSection = "sub";
    else if (section.includes("DUBBED")) currentSection = "dub";

    const links = section.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="dl-bubble-item"[^>]*>([\s\S]*?)<\/a>/g);
    for (const match of links) {
      const url = match[1];
      const inner = match[2];
      const isBest = inner.includes("dl-best-badge");
      const qualityMatch = inner.match(/dl-bubble-text[^>]*>([^<]+)/);
      const quality = qualityMatch ? qualityMatch[1].trim() : "Default";
      result[currentSection].push({ url, quality, best: isBest });
    }
  }

  return result;
}

function extractCodeFromUrl(url) {
  const match = url.match(/\/([A-Za-z0-9+/=]+)$/);
  return match ? match[1] : null;
}

// Source 1: 9anime AJAX
async function getFrom9Anime(malId, episode) {
  const r = await fetch("https://9anime.org.lv/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest"
    },
    body: `action=fetch_download_links&mal_id=${malId}&ep=${episode}`
  });
  if (!r.ok) throw new Error(`9anime ${r.status}`);
  const d = await r.json();
  if (!d.success || d.data?.status !== 200 || !d.data?.result) throw new Error("No links");
  return parseDownloadHtml(d.data.result);
}

// Source 2: NekoStream mapper
async function getFromNekoStream(malId, episode) {
  const ts = Math.floor(Date.now() / 1000);
  const r = await fetch(`https://mapper.nekostream.site/api/mal/${malId}/${episode}/${ts}`, {
    headers: { "User-Agent": UA }
  });
  if (!r.ok) throw new Error(`Mapper ${r.status}`);
  const servers = await r.json();
  if (servers.error) throw new Error(servers.message || servers.error);

  const result = { sub: [], dub: [] };
  for (const [name, data] of Object.entries(servers)) {
    if (name === "status") continue;
    for (const lang of ["sub", "dub"]) {
      if (data[lang]?.download) {
        for (const [server, dlUrl] of Object.entries(data[lang].download)) {
          const code = extractCodeFromUrl(dlUrl);
          if (code) {
            result[lang].push({ url: dlUrl, quality: "Default", best: false, source: server, code });
          }
        }
      }
    }
  }
  return result;
}

// Combined
async function getDownloadLinks(malId, episode) {
  const errors = [];
  let result = { sub: [], dub: [] };

  // Try 9anime
  try {
    const a9 = await getFrom9Anime(malId, episode);
    for (const lang of ["sub", "dub"]) {
      for (const link of a9[lang]) {
        const code = link.url.split("/").pop();
        result[lang].push({ ...link, code, source: "9anime", workerUrls: buildWorkerUrl(code) });
      }
    }
  } catch (e) { errors.push(`9anime: ${e.message}`); }

  // Try NekoStream
  try {
    const neko = await getFromNekoStream(malId, episode);
    for (const lang of ["sub", "dub"]) {
      for (const link of neko[lang]) {
        const exists = result[lang].some(x => x.code === link.code);
        if (!exists) {
          result[lang].push({ ...link, source: "nekostream", workerUrls: buildWorkerUrl(link.code) });
        }
      }
    }
  } catch (e) { errors.push(`NekoStream: ${e.message}`); }

  if (result.sub.length === 0 && result.dub.length === 0) {
    throw new Error(`No download links for MAL ${malId} ep ${episode}. ${errors.join("; ")}`);
  }

  return result;
}

async function getDownloadFromNekoCode(code) {
  return {
    code,
    url: `https://official9animedownloader.workerforcloud3.workers.dev/${code}`,
    workerUrls: buildWorkerUrl(code),
  };
}

module.exports = { getDownloadLinks, getDownloadFromNekoCode, getFrom9Anime, getFromNekoStream, buildWorkerUrl, buildAnimeUrl };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] && !Number.isFinite(Number(args[0]))) {
    getDownloadFromNekoCode(args[0])
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error("Error:", e.message); process.exit(1); });
  } else if (args.length >= 2) {
    getDownloadLinks(Number(args[0]), Number(args[1]))
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error("Error:", e.message); process.exit(1); });
  } else {
    console.log("Usage:");
    console.log("  node download.js <mal-id> <episode>     (download links from 9anime + NekoStream)");
    console.log("  node download.js <nekostream-code>      (build worker URLs from code)");
    process.exit(1);
  }
}
