// Cloudflare Worker - Proxy for anikage.cc and anizone.to
// Deploy: wrangler deploy worker.js --name animezilla-proxy

const ALLOWED_HOSTS = ["anikage.cc", "anizone.to"];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing url param", { status: 400 });

    const targetUrl = new URL(target);
    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response("Host not allowed", { status: 403 });
    }

    const isJson = url.searchParams.get("json") === "true";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": targetUrl.origin + "/",
      "Origin": targetUrl.origin,
      "Accept": isJson ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const r = await fetch(target, { headers });

    return new Response(r.body, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
