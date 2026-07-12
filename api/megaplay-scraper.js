const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SITES = {
  megaplay: "https://megaplay.buzz",
  vidtube: "https://vidtube.site",
};

async function getSource(embedId, site) {
  const base = SITES[site] || SITES.megaplay;
  const r = await fetch(`${base}/stream/getSources?id=${embedId}&id=${embedId}`, {
    headers: { "User-Agent": UA, "Referer": `${base}/`, "X-Requested-With": "XMLHttpRequest" }
  });
  if (!r.ok) throw new Error(`getSources ${embedId}: ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.message || d.error);
  return d;
}

function formatResult(source, meta) {
  return {
    ...meta,
    m3u8: source.sources?.file || null,
    tracks: (source.tracks || []).map(t => ({
      file: t.file, label: t.label, kind: t.kind, default: t.default || false
    })),
    intro: source.intro?.start ? source.intro : null,
    outro: source.outro?.start ? source.outro : null,
    server: source.server
  };
}

// === Source 1: MegaPlay MAL URL ===
async function scrapeMegaplay(malId, episode) {
  const output = {};
  const base = { mal_id: String(malId), episode };

  const results = await Promise.allSettled(["sub", "dub"].map(async (lang) => {
    const url = `${SITES.megaplay}/stream/mal/${malId}/${episode}/${lang}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://megaplay.buzz/" } });
    const html = await r.text();
    const match = html.match(/data-id="(\d+)"/);
    if (!match) throw new Error("No data-id");
    const source = await getSource(Number(match[1]), "megaplay");
    return { lang, ...formatResult(source, { ...base, source: "megaplay", dataId: Number(match[1]) }) };
  }));

  for (const r of results) {
    if (r.status === "fulfilled") output[r.value.lang] = r.value;
  }
  return output;
}

// === Source 2: VidTube embed URL ===
async function scrapeVidTube(embedUrl) {
  const r = await fetch(embedUrl, { headers: { "User-Agent": UA, "Referer": "https://vidtube.site/" } });
  const html = await r.text();
  const match = html.match(/data-id="(\d+)"/);
  if (!match) throw new Error("No data-id in vidtube embed");

  const source = await getSource(Number(match[1]), "vidtube");
  const type = embedUrl.includes("/sub") ? "sub" : embedUrl.includes("/dub") ? "dub" : "sub";
  return formatResult(source, { source: "vidtube", dataId: Number(match[1]), embedUrl, language: type });
}

// === Source 3: NekoStream mapper (anikototv.to) ===
async function scrapeNekoStream(malId, episode) {
  const ts = Math.floor(Date.now() / 1000);
  const r1 = await fetch(`https://mapper.nekostream.site/api/mal/${malId}/${episode}/${ts}`, { headers: { "User-Agent": UA } });
  if (!r1.ok) throw new Error(`Mapper ${r1.status}`);
  const servers = await r1.json();
  if (servers.error) throw new Error(servers.message || servers.error);

  const output = {};
  const base = { mal_id: String(malId), episode };

  for (const [serverName, data] of Object.entries(servers)) {
    if (serverName === "status") continue;
    const displayName = serverName.replace(/-$/, "");

    for (const lang of ["sub", "dub"]) {
      if (data[lang]?.url && !output[lang]) {
        try {
          const r2 = await fetch(`https://anikototv.to/ajax/server?get=${encodeURIComponent(data[lang].url)}`, {
            headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": "https://anikototv.to/" }
          });
          const d2 = await r2.json();
          if (d2.status !== 200 || !d2.result?.url) continue;

          const playerUrl = d2.result.url;
          const hash = playerUrl.split("#")[1];
          if (!hash) continue;
          const m3u8 = Buffer.from(hash, "base64").toString("utf8");
          if (!m3u8.includes(".m3u8")) continue;

          const skip = d2.result.skip_data;
          output[lang] = {
            ...base, m3u8, server: displayName, source: "nekostream",
            tracks: [], skip_data: skip || null,
            intro: skip?.intro?.[0] ? { start: skip.intro[0], end: skip.intro[1] } : null,
            outro: skip?.outro?.[0] ? { start: skip.outro[0], end: skip.outro[1] } : null
          };
        } catch {}
      }
    }
  }
  return output;
}

// === Main scrape function ===
async function scrapeBoth(malId, episode) {
  const errors = [];

  // Strategy 1: MegaPlay MAL URL (has tracks/subtitles, reliable)
  try {
    const mp = await scrapeMegaplay(malId, episode);
    if (Object.keys(mp).length > 0) return mp;
  } catch (e) { errors.push(`MegaPlay: ${e.message}`); }

  // Strategy 2: NekoStream mapper
  try {
    const neko = await scrapeNekoStream(malId, episode);
    if (Object.keys(neko).length > 0) return neko;
  } catch (e) { errors.push(`NekoStream: ${e.message}`); }

  throw new Error(`MAL ${malId} ep ${episode}: no sources. ${errors.join("; ")}`);
}

async function scrape(malId, episode, language) {
  const result = await scrapeBoth(malId, episode);
  if (result[language]) return result[language];
  throw new Error(`"${language}" not available. Available: ${Object.keys(result).join(", ")}`);
}

module.exports = { scrape, scrapeBoth, scrapeMegaplay, scrapeNekoStream, scrapeVidTube };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] && args[0].startsWith("http")) {
    scrapeVidTube(args[0])
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error("Error:", e.message); process.exit(1); });
  } else if (args.length >= 2) {
    const fn = args.length === 2 ? scrapeBoth : scrape;
    const fnArgs = args.length === 2 ? [Number(args[0]), Number(args[1])] : [Number(args[0]), Number(args[1]), args[2]];
    fn(...fnArgs)
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error("Error:", e.message); process.exit(1); });
  } else {
    console.log("Usage:");
    console.log("  node megaplay-scraper.js <mal-id> <episode>           (both sub+dub)");
    console.log("  node megaplay-scraper.js <mal-id> <episode> <sub|dub>  (single lang)");
    console.log("  node megaplay-scraper.js <vidtube-url>                (extract from vidtube embed)");
    process.exit(1);
  }
}
