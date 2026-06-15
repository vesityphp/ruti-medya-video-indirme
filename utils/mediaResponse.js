const crypto = require("crypto");
const URL_KEYS = new Set([
  "url",
  "download_url",
  "downloadUrl",
  "href",
  "link",
  "src",
  "video",
  "audio",
]);
function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}
function extensionFrom(item = {}, url = "") {
  const text = [
    url,
    item.format,
    item.quality,
    item.type,
    item.text,
    item.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("mp3") || text.includes("audio")) return "mp3";
  if (text.includes("m4a")) return "m4a";
  if (text.includes("webp")) return "webp";
  if (text.includes("png")) return "png";
  if (text.includes("jpg") || text.includes("jpeg")) return "jpg";
  return "mp4";
}
function kindFrom(ext, item = {}) {
  const text = [item.type, item.text, item.label, item.format]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (ext === "mp3" || ext === "m4a" || text.includes("audio") || text.includes("ses")) {
    return "ses";
  }
  if (["jpg", "png", "webp"].includes(ext) || text.includes("image") || text.includes("photo")) {
    return "gorsel";
  }
  return "video";
}
function fileNameFor({ platform = "medya", title = "", index = 0, item = {}, url = "" }) {
  const ext = extensionFrom(item, url);
  const kind = kindFrom(ext, item);
  const base = slugify(title) || slugify(platform) || "medya";
  const hash = crypto
    .createHash("sha1")
    .update(`${url}:${index}:${platform}`)
    .digest("hex")
    .slice(0, 6);
  return `ruti-medya-${slugify(platform)}-${base}-${kind}-${hash}.${ext}`;
}
function addFileNames(value, context = {}) {
  if (!value || typeof value !== "object") return value;
  const title = value.title || value.name || value.caption || context.title || "";
  const nextContext = { ...context, title };
  if (Array.isArray(value)) {
    return value.map((item, index) => addFileNames(item, { ...nextContext, index }));
  }
  const output = { ...value };
  for (const [key, nested] of Object.entries(output)) {
    if (URL_KEYS.has(key) && typeof nested === "string" && /^https?:\/\//i.test(nested)) {
      output.filename =
        output.filename ||
        output.fileName ||
        output.downloadName ||
        fileNameFor({
          platform: nextContext.platform,
          title: nextContext.title,
          index: nextContext.index || 0,
          item: output,
          url: nested,
        });
      output.fileName = output.fileName || output.filename;
      output.downloadName = output.downloadName || output.filename;
    } else if (nested && typeof nested === "object") {
      output[key] = addFileNames(nested, nextContext);
    }
  }
  return output;
}
function decorateMediaResponse(data, platform) {
  return addFileNames(data, { platform });
}
module.exports = { decorateMediaResponse, fileNameFor };
