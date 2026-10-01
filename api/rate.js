// Vercel 서버리스 함수: GET /api/rate?date=YYYY-MM-DD
const { getUsdRate } = require("./_hana");

module.exports = async (req, res) => {
  try {
    const data = await getUsdRate(req.query.date);
    res.setHeader("Cache-Control", data.kind === "final" ? "s-maxage=86400" : "no-store");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
