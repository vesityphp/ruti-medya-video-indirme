const axios = require("axios");
const cheerio = require("cheerio");
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
function looksLikeImage(url, text) {
  const combined = `${url || ""} ${text || ""}`.toLowerCase();
  return (
    /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url || "") ||
    combined.includes("image") ||
    combined.includes("photo") ||
    combined.includes("图片")
  );
}
function extractQuality(text) {
  const match = String(text || "").match(/(?:\(|\b)(\d{3,4}p)(?:\)|\b)/i);
  return match ? match[1].toLowerCase() : "unknown";
}
async function requestTwitterPage(tweetUrl) {
  const endpoint = "https://savetwitter.net/api/ajaxSearch";
  const form = new URLSearchParams({
    q: tweetUrl,
    lang: "en",
    cftoken: "",
  });
  return axios.post(endpoint, form.toString(), {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://savetwitter.net",
      referer: "https://savetwitter.net/en4",
      "x-requested-with": "XMLHttpRequest",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
  });
}
function parseTwitterResponse(data) {
  if (!data || (data.status !== "ok" && data.status !== true)) {
    const error = new Error(
      data?.mess || data?.message || "İndirme bağlantısı bulunamadı veya sistem şu anda yoğun. Lütfen tekrar deneyin."
    );
    error.code = "EMPTY_RESULT";
    throw error;
  }
  const html = typeof data.data === "string" ? data.data : "";
  if (!html.trim()) {
    const error = new Error("SaveTwitter boş HTML döndürdü.");
    error.code = "EMPTY_RESULT";
    throw error;
  }
  const $ = cheerio.load(html);
  const tweetId = $("#TwitterId").val() || null;
  const title = $(".tw-middle h3").first().text().trim() || null;
  const duration = $(".tw-middle p").first().text().trim() || null;
  const thumbnail = absoluteUrl(
    $(".thumbnail img").attr("src") ||
      $(".download-items__thumb img").attr("src"),
    "https://savetwitter.net/"
  );
  const videos = [];
  const images = [];
  const seenVideos = new Set();
  const seenImages = new Set();
  $(".tw-button-dl[href], a.tw-button-dl[href]").each((_, element) => {
    const rawHref = $(element).attr("href");
    const href = absoluteUrl(rawHref, "https://savetwitter.net/");
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (!href) return;
    if (looksLikeImage(href, text)) {
      if (!seenImages.has(href)) {
        seenImages.add(href);
        images.push({ url: href });
      }
      return;
    }
    if (!seenVideos.has(href)) {
      seenVideos.add(href);
      videos.push({
        quality: extractQuality(text),
        ...(text ? { text } : {}),
        url: href,
      });
    }
  });
  $(".photo-list img[src]").each((_, image) => {
    const src = absoluteUrl($(image).attr("src"), "https://savetwitter.net/");
    if (src && !seenImages.has(src)) {
      seenImages.add(src);
      images.push({ url: src });
    }
  });
  videos.sort((a, b) => {
    const qualityA = Number.parseInt(a.quality, 10) || 0;
    const qualityB = Number.parseInt(b.quality, 10) || 0;
    return qualityB - qualityA;
  });
  if (videos.length === 0 && images.length === 0) {
    const error = new Error(
      "İndirme bağlantısı bulunamadı veya sistem şu anda yoğun. Lütfen tekrar deneyin."
    );
    error.code = "EMPTY_RESULT";
    throw error;
  }
  return {
    type: videos.length ? "video" : "photo",
    tweetId,
    title,
    duration,
    thumbnail,
    videos,
    images,
  };
}
async function twitterDownloader(tweetUrl) {
  if (!tweetUrl || !isHttpUrl(tweetUrl)) {
    throw new Error("Geçerli bir Twitter/X bağlantısı gerekli.");
  }
  try {
    return await withRetry(async () => {
      const response = await requestTwitterPage(tweetUrl);
      return parseTwitterResponse(response.data);
    });
  } catch (error) {
    const status = error?.response?.status;
    const statusText = status ? ` (HTTP ${status})` : "";
    throw new Error(
      `Twitter/X indirme bağlantıları alınamadı${statusText}: ${error.message}`
    );
  }
}
module.exports = { twitterDownloader };
