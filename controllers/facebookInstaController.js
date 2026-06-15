const facebookInsta = require("../services/facebookInstaService");
const { decorateMediaResponse } = require("../utils/mediaResponse");
async function handleFacebookInstaDownload(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter." });
  }
  try {
    const data = decorateMediaResponse(await facebookInsta(url), "instagram-facebook");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
module.exports = { handleFacebookInstaDownload };
