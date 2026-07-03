const { getImg, renderPage } = require("./lib");

module.exports = async (req, res) => {
  try {
    const title = req.query.title;
    const ep = parseInt(req.query.episode || "1");
    const sub = req.query.sub || "";
    const dub = req.query.dub || "";
    const image = req.query.image || "";

    if (!title) return res.status(400).json({ error: "title required" });

    const img = image || (await getImg(title, ep));
    const html = renderPage(title, ep, img, sub, dub);
    return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
