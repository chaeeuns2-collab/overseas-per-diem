// 하나은행 USD 최종 고시를 날짜별로 저장한다.
//   rates.json : 매매기준율
//   cash.json  : 현찰 사실 때 환율 (공무원보수 등의 업무지침 Ⅱ.5.나: 달러를 현금으로 구입할 때 적용하는 환율)
// 하나은행의 '최종' 고시는 다음 영업일 아침에야 확정된다(연휴 앞 금요일은 연휴가 끝날 때까지 바뀜).
// 그래서 새 날짜를 채운 뒤 최근 RECHECK_DAYS일 치를 매번 다시 조회하고, cash.json에 빠진 날짜도 채운다.
// GitHub Actions에서 매일 실행된다.
const fs = require("fs");
const path = require("path");
const { getUsdRate, getFxTable, todayKST } = require("../api/_hana");

const FILE = path.join(__dirname, "..", "rates.json");
const CASH = path.join(__dirname, "..", "cash.json");
const START = "2024-01-02";
const RECHECK_DAYS = 14;
const FX_DIR = path.join(__dirname, "..", "fx");
const FX_START = "2026-01-02";   // 현지통화 환율은 2026년부터 보관

const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0, 10);
const key = s => s.replace(/-/g, "");
const dash = k => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}`;
const load = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
const save = (f, o) => { const ks = Object.keys(o).sort(); fs.writeFileSync(f, "{\n" + ks.map(k => `"${k}":${o[k]}`).join(",\n") + "\n}\n"); return ks; };

(async () => {
  const rates = load(FILE), cash = load(CASH);
  const keys = Object.keys(rates).sort();
  const last = keys.length ? keys[keys.length - 1] : null;
  const today = todayKST();

  // 확인할 날짜: (1) 마지막 저장일 이후 ~ 어제, (2) 최근 RECHECK_DAYS일, (3) cash.json에 빠진 날짜
  const todo = new Set();
  const from = new Date((last ? dash(last) : START) + "T00:00:00Z");
  const recheckFrom = new Date(today + "T00:00:00Z"); recheckFrom.setUTCDate(recheckFrom.getUTCDate() - RECHECK_DAYS);
  if (last && recheckFrom < from) from.setTime(recheckFrom.getTime());
  for (const d = from; iso(d) < today; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) todo.add(iso(d));
  }
  for (const k of keys) if (cash[k] == null) todo.add(dash(k));

  let added = 0, fixed = 0, failed = 0;
  for (const date of [...todo].sort()) {
    const k = key(date);
    try {
      const r = await getUsdRate(date, { finalOnly: true });
      if (r.noticeDate !== date) { console.log(date, "holiday (latest notice", r.noticeDate + ")"); continue; }
      if (rates[k] == null) { added++; console.log(date, r.rate, r.cashBuy); }
      else if (rates[k] !== r.rate || (cash[k] != null && cash[k] !== r.cashBuy)) { fixed++; console.log(date, "corrected", rates[k], "->", r.rate, "/ cash", cash[k], "->", r.cashBuy); }
      rates[k] = r.rate; cash[k] = r.cashBuy;
    } catch (e) {
      failed++; console.error(date, "failed:", e.message);
    }
    await sleep(200);
  }

  // 1달러당 현지통화 환율 (숙박비 실비 상한액 현지통화 환산용): fx/YYYY.json { "YYYYMMDD": { CODE: perUSD | [perUSD, check] } }
  // 확인 대상: 위에서 확인한 날짜 + FX_START 이후 빠진 영업일
  const fxFiles = {};
  const fxLoad = y => fxFiles[y] || (fxFiles[y] = load(path.join(FX_DIR, `${y}.json`)));
  const fxTodo = new Set([...todo].filter(d => d >= FX_START));
  for (const k of Object.keys(rates)) { const d = dash(k); if (d >= FX_START && fxLoad(d.slice(0, 4))[k] == null) fxTodo.add(d); }
  let fxDone = 0, fxFailed = 0;
  for (const date of [...fxTodo].sort()) {
    try {
      const r = await getFxTable(date, { finalOnly: true });
      if (r.noticeDate !== date) continue;
      fxLoad(date.slice(0, 4))[key(date)] = r.rates; fxDone++;
    } catch (e) { fxFailed++; console.error(date, "fx failed:", e.message); }
    await sleep(200);
  }
  if (!fs.existsSync(FX_DIR)) fs.mkdirSync(FX_DIR);
  for (const y in fxFiles) {
    const o = fxFiles[y], ks = Object.keys(o).sort();
    fs.writeFileSync(path.join(FX_DIR, `${y}.json`), "{\n" + ks.map(k => `"${k}":${JSON.stringify(o[k])}`).join(",\n") + "\n}\n");
  }
  console.log(`fx: updated ${fxDone}, failed ${fxFailed}`);

  const sorted = save(FILE, rates); save(CASH, cash);
  console.log(`checked ${todo.size}, added ${added}, corrected ${fixed}, failed ${failed}, total ${sorted.length}, latest ${sorted[sorted.length - 1]}`);
  if (failed && !added && !fixed) process.exit(1);
})();
