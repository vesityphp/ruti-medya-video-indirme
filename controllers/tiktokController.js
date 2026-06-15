const { fetchTikTokData } = require("../services/tiktokService");
const { decorateMediaResponse } = require("../utils/mediaResponse");
async function handleTikTokDownload(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'url' query parameter." });
    }
    const data = decorateMediaResponse(await fetchTikTokData(url), "tiktok");
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
module.exports = { handleTikTokDownload };