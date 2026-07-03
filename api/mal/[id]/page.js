const { jikanInfo, findMalId, ajaxDL, parseDL, getImg, renderPage } = require("../../lib");

module.exports = async (req, res) => {
  try {
    const mid = parseInt(req.query.id);
    const ep = parseInt(req.query.episode || "1");

    const info = await jikanInfo(mid);
    const name = info.eng || info.title;
    const imid = await findMalId(name);
    if (!imid) return res.status(404).json({ error: "Anime not found" });

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
