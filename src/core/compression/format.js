import { ALGORITHMS } from "./constants.js";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.max(
    0,
    Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k))),
  );
  const scaled = bytes / Math.pow(k, i);
  return `${scaled.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function detectFormat(fileName, mimeType, rawBytes) {
  if (rawBytes && rawBytes.length >= 12) {
    if (
      rawBytes[0] === 0x52 &&
      rawBytes[1] === 0x49 &&
      rawBytes[2] === 0x46 &&
      rawBytes[3] === 0x46 &&
      rawBytes[8] === 0x57 &&
      rawBytes[9] === 0x45 &&
      rawBytes[10] === 0x42 &&
      rawBytes[11] === 0x50
    ) {
      return "webp";
    }
  }
  if (rawBytes && rawBytes.length >= 4) {
    if (
      rawBytes[0] === 0x89 &&
      rawBytes[1] === 0x50 &&
      rawBytes[2] === 0x4e &&
      rawBytes[3] === 0x47
    ) {
      return "png";
    }
  }
  if (rawBytes && rawBytes.length >= 3) {
    if (rawBytes[0] === 0xff && rawBytes[1] === 0xd8 && rawBytes[2] === 0xff) {
      return "jpeg";
    }
  }
  const lower = String(fileName || "").toLowerCase();
  if (mimeType === "image/webp" || lower.endsWith(".webp")) {
    return "webp";
  }
  if (mimeType === "image/png" || lower.endsWith(".png")) {
    return "png";
  }
  return "jpeg";
}

export function isSupportedImageFile(fileName, mimeType) {
  const lower = String(fileName || "").toLowerCase();
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp" ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp")
  );
}

export function sortFilesNaturally(files) {
  if (!files || typeof files[Symbol.iterator] !== "function") return [];
  return [...files].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function detectAlphaChannel(rgbaData) {
  if (!rgbaData || !rgbaData.length) return false;
  for (let i = 3; i < rgbaData.length; i += 4) {
    if (rgbaData[i] < 255) return true;
  }
  return false;
}

export function calculateSavingsPercent(origSize, compSize) {
  if (
    !Number.isFinite(origSize) ||
    origSize <= 0 ||
    !Number.isFinite(compSize) ||
    compSize < 0
  ) {
    return null;
  }
  const raw = Math.round(((origSize - compSize) / origSize) * 100);
  return raw === 0 ? 0 : raw;
}

export function getOutputFileName(name, format, method) {
  const safeName = String(name || "image");
  const dotIdx = safeName.lastIndexOf(".");
  const base = dotIdx > 0 ? safeName.substring(0, dotIdx) : safeName;
  const spec = ALGORITHMS[method];
  const safeFormat = String(format || "")
    .toLowerCase()
    .trim();
  const ext =
    (spec && spec.extension) || (safeFormat === "png" ? "png" : "jpg");
  return `${base}_${method}.${ext}`;
}

export function resolveUniqueBatchFileNames(items) {
  if (!Array.isArray(items)) return [];
  const usedNames = new Map();
  return items.map((item) => {
    let fname = getOutputFileName(item?.name, item?.format, item?.method);
    const count = usedNames.get(fname) || 0;
    usedNames.set(fname, count + 1);
    if (count > 0) {
      const dotIdx = fname.lastIndexOf(".");
      fname =
        dotIdx !== -1
          ? `${fname.slice(0, dotIdx)}_${count + 1}${fname.slice(dotIdx)}`
          : `${fname}_${count + 1}`;
    }
    return { item, filename: fname };
  });
}
