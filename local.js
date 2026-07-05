const http = require("http");
const { execSync } = require("child_process");
const handler = require("./api/index.js");

try {
  const out = execSync('netstat -ano | findstr :3000 | findstr LISTENING', { encoding: "utf8" });
  const pid = out.trim().split(/\s+/).pop();
  if (pid && pid !== "0") execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
} catch {}

setTimeout(startServer, 500);

function startServer() {
const server = http.createServer(async (req, res) => {
  const fakeReq = {
    url: req.url,
    headers: req.headers,
  };

  const resHeaders = {};
  const fakeRes = {
    _raw: res,
    status(s) {
      const self = this;
      return {
        json(d) {
          res.writeHead(s, { "Content-Type": "application/json", ...resHeaders });
          res.end(JSON.stringify(d));
        },
        send(d) {
          const ct = resHeaders["Content-Type"] || (typeof d === "string" ? "text/plain" : "application/octet-stream");
          res.writeHead(s, { "Content-Type": ct, ...resHeaders });
          res.end(d);
        },
      };
    },
    send(d) {
      const ct = resHeaders["Content-Type"] || (typeof d === "string" ? "text/plain" : "application/octet-stream");
      res.writeHead(200, { "Content-Type": ct, ...resHeaders });
      res.end(d);
    },
    setHeader(k, v) {
      resHeaders[k] = v;
      return {
        send(h) {
          const ct = Buffer.isBuffer(h) ? (resHeaders["Content-Type"] || "application/octet-stream") : (resHeaders["Content-Type"] || "text/plain");
          const hdrs = { ...resHeaders };
          res.writeHead(200, hdrs);
          res.end(h);
        },
      };
    },
    redirect(url) {
      res.writeHead(302, { Location: url });
      res.end();
    },
  };

  try {
    await handler(fakeReq, fakeRes);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(3000, () => {
  console.log("AnimeZilla local: http://localhost:3000");
  console.log("  GET /api/mal/21/page?episode=1      (single episode)");
  console.log("  GET /api/mal/21/season               (full season)");
  console.log("  GET /api/page?title=One+Piece&episode=1");
  console.log("  GET /api/toonstream/21?episode=6     (toonstream links)");
  console.log("  GET /api/embed/38691/2/1             (embed iframe)");
});
}
