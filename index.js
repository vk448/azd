const http = require("http");
const handler = require("./api/index.js");

const PORT = process.env.PORT || 3000;

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

server.listen(PORT, () => {
  console.log(`AnimeZilla running on port ${PORT}`);
});
