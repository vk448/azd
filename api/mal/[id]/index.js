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

module.exports = async (req, res) => {
  try {
    const mid = parseInt(req.query.id);
    const ep = parseInt(req.query.episode || "1");
    if (!mid) return res.status(400).json({ error: "mal_id required" });

    const info = await jikanInfo(mid);
    const name = info.eng || info.title;
    const imid = await findMalId(name);
    if (!imid) return res.status(404).json({ error: "Anime not found on 9anime" });

    const dl = await ajaxDL(imid, ep);
    if (!dl?.data || dl.data.status !== 200)
      return res.status(404).json({ error: "No download links" });

    const dls = parseDL(dl.data.result || "");
    return res.status(200).json({
      anime: name,
      episode: ep,
      mal_id: imid,
      downloads: { subtitled: dls.sub, dubbed: dls.dub },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
