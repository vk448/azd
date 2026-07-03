import type { VercelRequest, VercelResponse } from "@vercel/node";
import { jikanInfo, findMalId, ajaxDL, parseDL, getImg, renderPage, jsonResp } from "./lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const title = req.query.title as string;
    const ep = parseInt((req.query.episode as string) || "1");
    const sub = (req.query.sub as string) || "";
    const dub = (req.query.dub as string) || "";
    const image = (req.query.image as string) || "";

    if (!title) return res.status(400).json({ error: "title required" });

    const img = image || (await getImg(title, ep));
    const html = renderPage(title, ep, img, sub, dub);
    return res.setHeader("Content-Type", "text/html;charset=UTF-8").send(html);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
