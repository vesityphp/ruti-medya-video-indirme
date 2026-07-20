const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");
const REQUEST_TIMEOUT_MS = Number(process.env.MEDIA_REQUEST_TIMEOUT_MS) || 15000;
const MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.MEDIA_REQUEST_ATTEMPTS) || 3
);
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
function absoluteUrl(value, baseUrl) {
  if (!value || value === "#") return null;
  try {
    const resolved = new URL(value, baseUrl).href;
    return isHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
function cleanBackgroundImage(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^url\(["']?(.*?)["']?\)$/i);
  return match ? match[1] : value;
}
function isRetryableError(error) {
  if (error?.code === "EMPTY_RESULT") return true;
  const retryableCodes = new Set([
    "ECONNABORTED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ERR_NETWORK",
  ]);
  if (retryableCodes.has(error?.code)) return true;
  const status = error?.response?.status;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
async function withRetry(task) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_ATTEMPTS || !isRetryableError(error)) {
        break;
      }
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}
async function requestTikTokPage(videoUrl) {
  const body = qs.stringify({
    id: videoUrl,
    locale: "en",
    tt: "dHl6Ylg4",
  });
  return axios.post("https://ssstik.io/abc?url=dl", body, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      referer: "https://ssstik.io/en-1",
      origin: "https://ssstik.io",
      "hx-request": "true",
      "hx-target": "target",
      "hx-trigger": "_gcaptcha_pt",
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: "text",
  });
}
function parseTikTokPage(html) {
  if (typeof html !== "string" || !html.trim()) {
    const error = new Error("SSSTik boş cevap döndürdü.");
    error.code = "EMPTY_RESULT";
    throw error;
  }
  const $ = cheerio.load(html);
  const title =
    $("#avatar_and_text h2").text().trim() ||
    $("#avatarAndTextUsual h2").text().trim() ||
    null;
  const rawThumbnail =
    $(".result_author").attr("src") ||
    $("#mainpicture").css("background-image") ||
    null;
  const thumbnail = absoluteUrl(
    cleanBackgroundImage(rawThumbnail),
    "https://ssstik.io"
  );
  const downloads = [];
  const seenUrls = new Set();
  $("a.download_link").each((_, element) => {
    const rawUrl = $(element).attr("href");
    const url = absoluteUrl(rawUrl, "https://ssstik.io");
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    const text = $(element).text().replace(/\s+/g, " ").trim();
    const isSlide = $(element).hasClass("slide");
    downloads.push({
      ...(text ? { text } : {}),
      ...(isSlide ? { type: "image" } : {}),
      url,
    });
  });
  if (downloads.length === 0) {
    const error = new Error(
      "İndirme bağlantısı bulunamadı veya sistem şu anda yoğun. Lütfen tekrar deneyin."
    );
    error.code = "EMPTY_RESULT";
    throw error;
  }
  return {
    status: true,
    title,
    thumbnail,
    downloads,
  };
}
async function fetchTikTokData(videoUrl) {
  if (!videoUrl || !isHttpUrl(videoUrl)) {
    throw new Error("Geçerli bir TikTok bağlantısı gerekli.");
  }
  try {
    return await withRetry(async () => {
      const response = await requestTikTokPage(videoUrl);
      return parseTikTokPage(response.data);
    });
  } catch (error) {
    const status = error?.response?.status;
    const statusText = status ? ` (HTTP ${status})` : "";
    throw new Error(
      `TikTok indirme bağlantıları alınamadı${statusText}: ${error.message}`
    );
  }
}
module.exports = { fetchTikTokData };
