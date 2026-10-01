// rates.json에 빠진 영업일의 하나은행 USD 최종 매매기준율을 채운다.
// 최종 고시가 확정된 어제까지만 저장한다. GitHub Actions에서 매일 실행된다.
const fs = require("fs");
const path = require("path");
const { getUsdRate, todayKST } = require("../api/_hana");

const FILE = path.join(__dirname, "..", "rates.json");
const START = "2024-01-02";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0, 10);
const key = s => s.replace(/-/g, "");

(async () => {
  const rates = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  const keys = Object.keys(rates).sort();
  const last = keys.length ? keys[keys.length - 1] : null;
  const from = new Date((last ? `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6)}` : START) + "T00:00:00Z");
  if (last) from.setUTCDate(from.getUTCDate() + 1);
  const today = todayKST();

  let added = 0, failed = 0;
  for (const d = from; iso(d) < today; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const date = iso(d);
    try {
      const r = await getUsdRate(date, { finalOnly: true });
      if (r.noticeDate === date) { rates[key(date)] = r.rate; added++; console.log(date, r.rate); }
      else console.log(date, "holiday (latest notice", r.noticeDate + ")");
    } catch (e) {
      failed++; console.error(date, "failed:", e.message);
    }
    await sleep(300);
  }

  const sorted = Object.keys(rates).sort();
  const out = "{\n" + sorted.map(k => `"${k}":${rates[k]}`).join(",\n") + "\n}\n";
  fs.writeFileSync(FILE, out);
  console.log(`added ${added}, failed ${failed}, total ${sorted.length}, latest ${sorted[sorted.length - 1]}`);
  if (failed && !added) process.exit(1);
})();
