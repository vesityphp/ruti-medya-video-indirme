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
function decodeRepeatedly(value) {
  let result = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}
function extractDirectUrl(href) {
  if (!href) return null;
  try {
    const parsed = new URL(href, "https://www.savepin.app/");
    const nestedUrl = parsed.searchParams.get("url");
    const candidate = decodeRepeatedly(nestedUrl || parsed.href);
    return isHttpUrl(candidate) ? candidate : null;
  } catch {
    const candidate = decodeRepeatedly(href);
    return isHttpUrl(candidate) ? candidate : null;
  }
}
function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const resolved = new URL(value, baseUrl).href;
    return isHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
async function requestPinterestPage(url) {
  const encodedUrl = encodeURIComponent(url);
  const fullUrl =
    `https://www.savepin.app/download.php?url=${encodedUrl}` +
    "&lang=en&type=redirect";
  return axios.get(fullUrl, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua":
        '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      referer: "https://www.savepin.app/",
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: "text",
  });
}
function parsePinterestPage(html) {
  if (typeof html !== "string" || !html.trim()) {
    const error = new Error("SavePin boş cevap döndürdü.");
    error.code = "EMPTY_RESULT";
    throw error;
  }
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || null;
  const thumbnail = absoluteUrl(
    $(".image-container img").attr("src"),
    "https://www.savepin.app/"
  );
  const downloads = [];
  const seenUrls = new Set();
  $("tbody tr").each((_, element) => {
    const quality = $(element).find(".video-quality").text().trim();
    const format = $(element).find("td:nth-child(2)").text().trim();
    const href = $(element).find("a[href]").attr("href");
    const directUrl = extractDirectUrl(href);
    if (!directUrl || seenUrls.has(directUrl)) return;
    seenUrls.add(directUrl);
    downloads.push({
      quality: quality || "unknown",
      format: format || "unknown",
      url: directUrl,
    });
  });
  if (downloads.length === 0) {
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href || !href.includes("url=")) return;
      const directUrl = extractDirectUrl(href);
      if (!directUrl || seenUrls.has(directUrl)) return;
      seenUrls.add(directUrl);
      downloads.push({
        quality: $(element).text().replace(/\s+/g, " ").trim() || "unknown",
        format: "unknown",
        url: directUrl,
      });
    });
  }
  if (downloads.length === 0) {
    const error = new Error(
      "İndirme bağlantısı bulunamadı veya sistem şu anda yoğun. Lütfen tekrar deneyin."
    );
    error.code = "EMPTY_RESULT";
    throw error;
  }
  return {
    title,
    thumbnail,
    downloads,
  };
}
async function fetchPinterestMedia(url) {
  if (!url || !isHttpUrl(url)) {
    throw new Error("Geçerli bir Pinterest bağlantısı gerekli.");
  }
  try {
    return await withRetry(async () => {
      const response = await requestPinterestPage(url);
      return parsePinterestPage(response.data);
    });
  } catch (error) {
    const status = error?.response?.status;
    const statusText = status ? ` (HTTP ${status})` : "";
    throw new Error(
      `Pinterest indirme bağlantıları alınamadı${statusText}: ${error.message}`
    );
  }
}
module.exports = { fetchPinterestMedia };
