// 내 PC에서 실행: node server.js  →  http://localhost:8080
// index.html을 보여 주고 /api/rate 로 하나은행 환율을 실시간 조회해 전달한다.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { getUsdRate } = require("./api/_hana");

const PORT = process.env.PORT || 8080;
const page = path.join(__dirname, "index.html");

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/rate") {
    try {
      const data = await getUsdRate(url.searchParams.get("date"));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === "/rates.json") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    fs.createReadStream(path.join(__dirname, "rates.json")).pipe(res);
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(page).pipe(res);
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`교육공무원 국외여행 체재비: http://localhost:${PORT}`));
