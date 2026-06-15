const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const app = express();
app.use(cors());
app.use(express.json());
app.set("json spaces", 2);
app.use(morgan("dev"));
app.use("/api/meta", require("./routes/facebookInsta"));
app.use("/api/pinterest", require("./routes/pinterest"));
app.use("/api/reddit", require("./routes/reddit"));
app.use("/api/spotify", require("./routes/spotify"));
app.use("/api/snapchat", require("./routes/snapchat"));
app.use("/api/soundcloud", require("./routes/soundcloud"));
app.use("/api/tiktok", require("./routes/tiktok"));
app.use("/api/twitter", require("./routes/twitter"));
app.use("/api/youtube", require("./routes/youtube"));
const endpoints = [
  "/api/meta",
  "/api/pinterest",
  "/api/reddit",
  "/api/snapchat",
  "/api/spotify",
  "/api/soundcloud",
  "/api/tiktok",
  "/api/twitter",
  "/api/youtube",
];
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    author: "Ruti Medya",
    contact: "https://rutimedya.com/",
    message: "Ruti Medya Video Indirme API calisiyor",
    brand: "Ruti Medya",
    website: "https://rutimedya.com",
    endpoints,
  });
});
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
  });
});
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ruti Medya video API running on port ${PORT}`);
  });
}
module.exports = app;