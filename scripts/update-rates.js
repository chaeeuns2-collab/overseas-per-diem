// rates.json에 하나은행 USD 최종 매매기준율을 채우고, 최근 값은 다시 확인해 바로잡는다.
// 하나은행의 '최종' 고시는 다음 영업일 아침에야 확정된다(연휴 앞 금요일은 연휴가 끝날 때까지 바뀜).
// 그래서 새 날짜를 채운 뒤 최근 RECHECK_DAYS일 치를 매번 다시 조회한다. GitHub Actions에서 매일 실행된다.
const fs = require("fs");
const path = require("path");
const { getUsdRate, todayKST } = require("../api/_hana");

const FILE = path.join(__dirname, "..", "rates.json");
const START = "2024-01-02";
const RECHECK_DAYS = 14;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0, 10);
const key = s => s.replace(/-/g, "");
const dash = k => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}`;

(async () => {
  const rates = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  const keys = Object.keys(rates).sort();
  const last = keys.length ? keys[keys.length - 1] : null;
  const today = todayKST();

  // 다시 확인할 시작일: 마지막 저장일 다음 날과 오늘-RECHECK_DAYS 중 더 이른 날
  const recheckFrom = new Date(today + "T00:00:00Z"); recheckFrom.setUTCDate(recheckFrom.getUTCDate() - RECHECK_DAYS);
  const from = new Date((last ? dash(last) : START) + "T00:00:00Z");
  if (last) from.setUTCDate(from.getUTCDate() + 1);
  if (last && recheckFrom < from) from.setTime(recheckFrom.getTime());

  let added = 0, fixed = 0, failed = 0;
  for (const d = from; iso(d) < today; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const date = iso(d), k = key(date);
    try {
      const r = await getUsdRate(date, { finalOnly: true });
      if (r.noticeDate !== date) { console.log(date, "holiday (latest notice", r.noticeDate + ")"); }
      else if (rates[k] == null) { rates[k] = r.rate; added++; console.log(date, r.rate); }
      else if (rates[k] !== r.rate) { console.log(date, "corrected", rates[k], "->", r.rate); rates[k] = r.rate; fixed++; }
    } catch (e) {
      failed++; console.error(date, "failed:", e.message);
    }
    await sleep(300);
  }

  const sorted = Object.keys(rates).sort();
  const out = "{\n" + sorted.map(k => `"${k}":${rates[k]}`).join(",\n") + "\n}\n";
  fs.writeFileSync(FILE, out);
  console.log(`added ${added}, corrected ${fixed}, failed ${failed}, total ${sorted.length}, latest ${sorted[sorted.length - 1]}`);
  if (failed && !added && !fixed) process.exit(1);
})();
