const WORKER_BASE = "https://official9animedownloader.workerforcloud3.workers.dev";

function buildPlayerUrl(playerHtmlUrl, m3u8, opts = {}) {
  const config = {
    m3u8,
    tracks: opts.tracks || [],
    intro: opts.intro || null,
    outro: opts.outro || null,
    title: opts.title || ''
  };
  const encoded = Buffer.from(JSON.stringify(config)).toString("base64");
  return `${playerHtmlUrl}#${encoded}`;
}

function buildDownloadUrl(code) {
  return `${WORKER_BASE}/${code}`;
}

function buildAllDownloadUrls(code) {
  return [
    `https://official9animedownloader.workerforcloud.workers.dev/${code}`,
    `https://official9animedownloader.workerforcloud3.workers.dev/${code}`,
    `https://official9animedownloader2.workerforcloud2.workers.dev/${code}`,
  ];
}

module.exports = { buildPlayerUrl, buildDownloadUrl, buildAllDownloadUrls, WORKER_BASE };

if (require.main === module) {
  const url = buildPlayerUrl(
    "https://animezilla.pages.dev/api/megaplayer.html",
    "https://cdn.mewstream.buzz/anime/xxx/master.m3u8",
    {
      tracks: [{ file: "https://example.com/sub.vtt", label: "English", kind: "captions", default: true }],
      intro: { start: 31, end: 111 },
      outro: { start: 1376, end: 1447 }
    }
  );
  console.log("Player URL:", url);
  console.log("Config decoded:", JSON.parse(Buffer.from(url.split("#")[1], "base64").toString()));
}
