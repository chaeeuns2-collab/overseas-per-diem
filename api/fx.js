// Vercel 서버리스 함수: GET /api/fx?date=YYYY-MM-DD → 1달러당 현지통화 환율표
const { getFxTable } = require("./_hana");

module.exports = async (req, res) => {
  try {
    const data = await getFxTable(req.query.date);
    res.setHeader("Cache-Control", data.kind === "final" ? "s-maxage=86400" : "no-store");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
