// 하나은행 환율조회(외환 고시환율)에서 USD 매매기준율을 가져온다.
// 과거 날짜는 '최종' 고시(pbldDvCd=0), 오늘은 '현재' 고시(pbldDvCd=3)를 조회한다.
const HANA = "https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do";

function todayKST() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

async function getUsdRate(date, { finalOnly = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("date must be YYYY-MM-DD");
  const today = todayKST();
  if (date > today) throw new Error("future date");
  if (finalOnly && date === today) throw new Error("today's final rate is not published yet");
  const kind = date === today ? "current" : "final";
  const body = new URLSearchParams({
    ajax: "true", curCd: "", tmpInqStrDt: date, pbldDvCd: kind === "current" ? "3" : "0",
    pbldSqn: "", hid_key_data: "", inqStrDt: date.replace(/-/g, ""), inqKindCd: "1",
    hid_enc_data: "", requestTarget: "searchContentDiv",
  });
  const res = await fetch(HANA, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": "https://www.kebhana.com/cms/rate/index.do?contentUrl=/cms/rate/wpfxd651_01i.do",
      "User-Agent": "Mozilla/5.0",
    },
    body,
  });
  if (!res.ok) throw new Error("hana http " + res.status);
  const html = await res.text();
  const at = html.indexOf("미국 USD");
  if (at < 0) throw new Error("USD row not found");
  const cells = [...html.slice(at).matchAll(/<td class="txtAr">([\d,.]+)<\/td>/g)].map(m => m[1]);
  const num = s => parseFloat((s || "").replace(/,/g, ""));
  const rate = num(cells[7]);     // 8번째 칸 = 매매기준율
  const cashBuy = num(cells[0]);  // 1번째 칸 = 현찰 사실 때 (업무지침 Ⅱ.5.나: 달러를 현금으로 구입할 때 환율)
  if (!(rate > 0) || !(cashBuy > 0)) throw new Error("rate parse failed");
  const nd = (html.match(/goFluctuation\('USD','(\d{8})'/) || [])[1];
  const round = (html.match(/\((\d+)회차\)/) || [])[1] || null;
  return {
    rate,
    cashBuy,
    noticeDate: nd ? `${nd.slice(0, 4)}-${nd.slice(4, 6)}-${nd.slice(6)}` : date,
    round: kind === "current" && round ? Number(round) : null,
    kind,
    source: "KEB Hana Bank",
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1달러당 현지통화 환율 (업무지침 Ⅱ.5.나.2)나)(1)~(3): 국외 숙박비 실비 상한액을 출장국가 통화로 환산)
//  - 고시환율 통화: 1 ÷ 미화환산율 (JPY·IDR·VND는 100 단위라 100 ÷ 미화환산율)
//  - 비고시환율 통화: Cross Rate를 그대로 적용
//  - 환율은 소수점 아래 4자리(5자리에서 반올림)
// 반환: { noticeDate, kind, rates: { CODE: perUSD | [perUSD, check] } }
//   check = 원화 기준율로 교차 계산한 값. 지침 값과 2% 넘게 다를 때만 넣는다(소수점 4자리 미화환산율의 오차 등).
const round4 = n => Math.round(n * 1e4) / 1e4;
const post = (url, params) => fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.kebhana.com/cms/rate/index.do?contentUrl=/cms/rate/wpfxd651_01i.do" },
  body: new URLSearchParams(params),
}).then(r => { if (!r.ok) throw new Error("hana http " + r.status); return r.text(); });

async function getFxTable(date, { finalOnly = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("date must be YYYY-MM-DD");
  const today = todayKST();
  if (date > today) throw new Error("future date");
  if (finalOnly && date === today) throw new Error("today's final rate is not published yet");
  const kind = date === today ? "current" : "final";
  const ymd = date.replace(/-/g, "");
  const num = s => parseFloat((s || "").replace(/,/g, ""));

  // 고시환율
  const main = await post("https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do", {
    ajax: "true", curCd: "", tmpInqStrDt: date, pbldDvCd: kind === "current" ? "3" : "0", pbldSqn: "", hid_key_data: "",
    inqStrDt: ymd, inqKindCd: "1", hid_enc_data: "", requestTarget: "searchContentDiv" });
  const nd = (main.match(/goFluctuation\('USD','(\d{8})'/) || [])[1];
  const krw = {}, rates = {};
  for (const row of main.split("<tr>").slice(1)) {
    const name = (row.match(/<u>\s*([^<]+?)\s*<\/u>/) || [])[1]; if (!name) continue;
    const m = name.match(/([A-Z]{3})\s*(?:\((\d+)\))?/); if (!m) continue;
    const code = m[1], unit = Number(m[2] || 1);
    const c = [...row.matchAll(/<td class="txtAr">([\d,.]+)<\/td>/g)].map(x => num(x[1]));
    if (!(c[9] > 0)) continue;
    krw[code] = c[7] / unit;                 // 1단위당 원화 매매기준율
    rates[code] = round4(unit / c[9]);       // 지침: 1(또는 100) ÷ 미화환산율
  }
  const usdKrw = krw.USD;

  // 비고시환율 (Cross Rate)
  const cross = await post("https://www.kebhana.com/cms/rate/wpfxd651_10i_01.do", {
    ajax: "true", tmpInqStrDt: date, inqDvCd: "az", inqStrDt: ymd, inqEndDt: ymd, inqKindCd: "2", hid_key_data: "",
    requestTarget: "searchContentDiv" });
  for (const row of cross.split("<tr>").slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, "").trim());
    if (tds.length < 5 || !/^[A-Z]{3}$/.test(tds[2])) continue;
    const code = tds[2], k = num(tds[3]), cr = num(tds[4]);
    if (rates[code] != null || !(cr > 0)) continue;   // 고시 통화가 우선
    krw[code] = k;
    let v = cr;
    // 일부 통화는 Cross Rate가 '현지통화 1단위당 달러'로 거꾸로 표기됨 → 원화 기준율과 비교해 바로잡음
    if (usdKrw && k > 0) { const est = usdKrw / k; if (Math.abs(1 / cr - est) < Math.abs(cr - est)) v = 1 / cr; }
    rates[code] = round4(v);
  }
  // 교차 확인: 원화 기준율로 계산한 값과 2% 넘게 차이 나면 함께 저장
  for (const code in rates) {
    if (!usdKrw || !(krw[code] > 0)) continue;
    const est = round4(usdKrw / krw[code]);
    if (Math.abs(est - rates[code]) / est > 0.02) rates[code] = [rates[code], est];
  }
  return { noticeDate: nd ? `${nd.slice(0, 4)}-${nd.slice(4, 6)}-${nd.slice(6)}` : date, kind, rates };
}

module.exports = { getUsdRate, getFxTable, todayKST };
