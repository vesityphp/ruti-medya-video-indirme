const { fetchPinterestMedia } = require("../services/pinterestService");
const { decorateMediaResponse } = require("../utils/mediaResponse");
async function handlePinterestDownload(req, res) {
  const { url } = req.query;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "Missing 'url' query parameter." });
  }
  try {
    const data = decorateMediaResponse(await fetchPinterestMedia(url), "pinterest");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
module.exports = { handlePinterestDownload };