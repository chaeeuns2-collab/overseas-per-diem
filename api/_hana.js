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
  const rate = parseFloat((cells[7] || "").replace(/,/g, "")); // 8번째 칸 = 매매기준율
  if (!(rate > 0)) throw new Error("rate parse failed");
  const nd = (html.match(/goFluctuation\('USD','(\d{8})'/) || [])[1];
  const round = (html.match(/\((\d+)회차\)/) || [])[1] || null;
  return {
    rate,
    noticeDate: nd ? `${nd.slice(0, 4)}-${nd.slice(4, 6)}-${nd.slice(6)}` : date,
    round: kind === "current" && round ? Number(round) : null,
    kind,
    source: "KEB Hana Bank",
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getUsdRate, todayKST };
