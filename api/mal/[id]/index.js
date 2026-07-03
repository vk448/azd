const { jikanInfo, findMalId, ajaxDL, parseDL, getImg, renderPage } = require("./lib");

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
