const http = require("http");
const handler = require("./api/index.js");

const server = http.createServer(async (req, res) => {
  const fakeReq = {
    url: req.url,
    headers: req.headers,
  };

  const fakeRes = {
    status(s) {
      return {
        json(d) {
          res.writeHead(s, { "Content-Type": "application/json" });
          res.end(JSON.stringify(d));
        },
      };
    },
    setHeader(k, v) {
      return {
        send(h) {
          res.writeHead(200, { "Content-Type": v });
          res.end(h);
        },
      };
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
  console.log("  GET /api/mal/21/page?episode=1   (single episode)");
  console.log("  GET /api/mal/21/season            (full season)");
  console.log("  GET /api/page?title=One+Piece&episode=1");
});
