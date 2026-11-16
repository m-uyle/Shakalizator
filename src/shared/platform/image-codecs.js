import {
  CDN_BASE,
  runWorkerJob,
  isWorkerItemCached,
  markWorkerItemCached,
} from "./codec-worker.js";

const WEBP_ENCODE_METHOD = 4;
const WEBP_LOSSLESS_EFFORT = 75;
const WEBP_ALPHA_MAX_QUALITY = 100;

const codecPromises = {};

function loadWasmModule(key, url) {
  if (!codecPromises[key]) {
    codecPromises[key] = import(url);
  }
  return codecPromises[key];
}

function getJpegModule() {
  return loadWasmModule("jpegMod", `${CDN_BASE}/@jsquash/jpeg@1.6.0/+esm`);
}

function getPngModule() {
  return loadWasmModule("pngMod", `${CDN_BASE}/@jsquash/png@3.1.1/+esm`);
}

function getWebpModule() {
  return loadWasmModule("webpMod", `${CDN_BASE}/@jsquash/webp@1.5.0/+esm`);
}

function getOxipngModule() {
  return loadWasmModule("oxipngMod", `${CDN_BASE}/@jsquash/oxipng@2.3.0/+esm`);
}

function getImageQModule() {
  return loadWasmModule("imageQ", `${CDN_BASE}/image-q@4.0.0/+esm`);
}

function toTightArrayBuffer(uint8) {
  if (uint8 instanceof ArrayBuffer) return uint8.slice(0);
  if (ArrayBuffer.isView(uint8)) {
    return uint8.buffer.slice(
      uint8.byteOffset,
      uint8.byteOffset + uint8.byteLength,
    );
  }
  return new ArrayBuffer(0);
}

async function decodeBytesDirectly(rawBytes, format) {
  const ab = toTightArrayBuffer(rawBytes);
  if (format === "webp") {
    const webpMod = await getWebpModule();
    const decodeWebp = webpMod.decode || webpMod.default;
    return await decodeWebp(ab);
  }
  if (format === "png") {
    try {
      const pngMod = await getPngModule();
      const decodePng = pngMod.decode || pngMod.default;
      return await decodePng(ab);
    } catch (err) {
      if (typeof globalThis.UPNG !== "undefined") {
        const decoded = globalThis.UPNG.decode(ab);
        const rgba = globalThis.UPNG.toRGBA8(decoded)[0];
        return new ImageData(
          new Uint8ClampedArray(rgba),
          decoded.width,
          decoded.height,
        );
      }
      throw err;
    }
  }
  const jpegMod = await getJpegModule();
  const decodeJpeg = jpegMod.decode || jpegMod.default;
  return await decodeJpeg(ab, { preserveOrientation: true });
}

async function encodeWebpImage(imageData, { isLossless, quality }) {
  const webpMod = await getWebpModule();
  const encodeWebp = webpMod.encode || webpMod.default;
  const clampedQ = Math.max(1, Math.min(100, quality || 70));

  return await encodeWebp(imageData, {
    quality: isLossless ? WEBP_LOSSLESS_EFFORT : clampedQ,
    lossless: isLossless ? 1 : 0,
    method: WEBP_ENCODE_METHOD,
    alpha_quality: isLossless
      ? WEBP_ALPHA_MAX_QUALITY
      : Math.min(WEBP_ALPHA_MAX_QUALITY, clampedQ + 15),
    near_lossless: WEBP_ALPHA_MAX_QUALITY,
    use_sharp_yuv: isLossless ? 0 : 1,
  });
}

async function compressOnMainThread(item, origImageData) {
  const method = item.method;
  const needsPixels =
    method === "mozjpeg" ||
    method === "upng" ||
    method === "wuquant" ||
    method === "webp" ||
    method === "webp_lossless";
  const resolvedImageData =
    origImageData ||
    (needsPixels
      ? await decodeBytesDirectly(item.rawBytes, item.format)
      : null);
  const w = resolvedImageData ? resolvedImageData.width : item.origWidth;
  const h = resolvedImageData ? resolvedImageData.height : item.origHeight;
  let outAb = null;
  let mimeType = "image/jpeg";
  let decFormat = "jpeg";

  if (method === "mozjpeg") {
    const jpegMod = await getJpegModule();
    const encodeJpeg = jpegMod.encode || jpegMod.default;
    const q = Math.max(1, Math.min(100, item.quality || 70));

    outAb = await encodeJpeg(resolvedImageData, {
      quality: q,
      baseline: false,
      arithmetic: false,
      progressive: true,
      optimize_coding: true,
      smoothing: 0,
      color_space: 3,
      quant_table: 3,
      trellis_multipass: true,
      trellis_opt_zero: true,
      trellis_opt_table: true,
      trellis_loops: 1,
      auto_subsample: true,
      chroma_subsample: 2,
      separate_chroma_quality: false,
      chroma_quality: q,
    });
    mimeType = "image/jpeg";
    decFormat = "jpeg";
  } else if (method === "oxipng") {
    const oxiMod = await getOxipngModule();
    const oxipngOptimise = oxiMod.optimise || oxiMod.default;
    const optAb = await oxipngOptimise(toTightArrayBuffer(item.rawBytes), {
      level: 4,
      interlace: false,
      optimiseAlpha: true,
    });
    outAb =
      optAb.byteLength < item.rawBytes.byteLength
        ? optAb
        : toTightArrayBuffer(item.rawBytes);
    mimeType = "image/png";
    decFormat = "png";
  } else if (method === "optipng") {
    let candidateAb = toTightArrayBuffer(item.rawBytes);
    if (typeof globalThis.optipng === "function") {
      const res = globalThis.optipng(new Uint8Array(item.rawBytes), [
        "-o2",
        "-i0",
        "-strip",
        "all",
      ]);
      if (
        res &&
        res.data &&
        res.data.byteLength > 0 &&
        res.data.byteLength < item.rawBytes.byteLength
      ) {
        candidateAb = toTightArrayBuffer(new Uint8Array(res.data));
      }
    }
    outAb = candidateAb;
    mimeType = "image/png";
    decFormat = "png";
  } else if (method === "upng") {
    const numColors = Math.max(16, Math.min(256, item.paletteColors || 256));
    const rgbaBuffer = toTightArrayBuffer(
      new Uint8Array(
        resolvedImageData.data.buffer,
        resolvedImageData.data.byteOffset,
        resolvedImageData.data.byteLength,
      ),
    );
    outAb = globalThis.UPNG.encode([rgbaBuffer], w, h, numColors);
    mimeType = "image/png";
    decFormat = "png";
  } else if (method === "wuquant") {
    const numColors = Math.max(16, Math.min(256, item.paletteColors || 256));
    const iq = await getImageQModule();
    const inContainer = iq.utils.PointContainer.fromUint8Array(
      resolvedImageData.data,
      w,
      h,
    );
    const palette = await iq.buildPalette([inContainer], {
      colorDistanceFormula: "euclidean-bt709",
      paletteQuantization: "wuquant",
      colors: numColors,
    });
    const outContainer = await iq.applyPalette(inContainer, palette, {
      colorDistanceFormula: "euclidean-bt709",
      imageQuantization: "floyd-steinberg",
    });
    const ditheredRgba = outContainer.toUint8Array();
    outAb = globalThis.UPNG.encode(
      [toTightArrayBuffer(ditheredRgba)],
      w,
      h,
      numColors,
    );
    mimeType = "image/png";
    decFormat = "png";
  } else if (method === "webp" || method === "webp_lossless") {
    outAb = await encodeWebpImage(resolvedImageData, {
      isLossless: method === "webp_lossless",
      quality: item.quality,
    });
    mimeType = "image/webp";
    decFormat = "webp";
  }

  if (!outAb) {
    throw new Error(
      `Compression produced empty output for method: "${method}"`,
    );
  }

  return {
    outputBlob: new Blob([outAb], { type: mimeType }),
    outBytes: new Uint8Array(outAb),
    decFormat,
  };
}

export async function decodeImageBytes(itemId, rawBytes, format) {
  if (!rawBytes || (rawBytes.length === 0 && rawBytes.byteLength === 0)) {
    throw new Error("Cannot decode empty or null byte buffer");
  }
  try {
    const rawCopy = toTightArrayBuffer(rawBytes);
    const res = await runWorkerJob(
      "decode",
      { itemId, rawBuffer: rawCopy, format },
      [rawCopy],
    );
    if (itemId) markWorkerItemCached(itemId);
    return new ImageData(
      new Uint8ClampedArray(res.rgbaBuffer),
      res.width,
      res.height,
    );
  } catch (workerErr) {
    console.warn(
      "Worker decode failed, falling back to main thread:",
      workerErr,
    );
    return await decodeBytesDirectly(rawBytes, format);
  }
}

export async function decodePreviewBytes(rawBytes, format) {
  if (!rawBytes || (rawBytes.length === 0 && rawBytes.byteLength === 0)) {
    throw new Error("Cannot decode empty or null byte buffer");
  }
  try {
    const rawCopy = toTightArrayBuffer(rawBytes);
    const res = await runWorkerJob(
      "decodeBytes",
      { rawBuffer: rawCopy, format },
      [rawCopy],
    );
    return new ImageData(
      new Uint8ClampedArray(res.rgbaBuffer),
      res.width,
      res.height,
    );
  } catch (workerErr) {
    console.warn(
      "Worker preview decode failed, falling back to main thread:",
      workerErr,
    );
    return await decodeBytesDirectly(rawBytes, format);
  }
}

export async function compressImageItem(item, origImageData) {
  if (!item) {
    throw new Error("Cannot compress null or undefined item");
  }
  try {
    const isCached = isWorkerItemCached(item.id);
    const payload = {
      itemId: item.id,
      method: item.method,
      format: item.format,
      quality: item.quality,
      paletteColors: item.paletteColors,
      width: origImageData ? origImageData.width : item.origWidth,
      height: origImageData ? origImageData.height : item.origHeight,
    };
    const transferList = [];
    if (!isCached) {
      const rawCopy = toTightArrayBuffer(item.rawBytes);
      payload.rawBuffer = rawCopy;
      transferList.push(rawCopy);
    }
    if (origImageData && origImageData.data) {
      const origRgbaCopy = toTightArrayBuffer(
        new Uint8Array(
          origImageData.data.buffer,
          origImageData.data.byteOffset,
          origImageData.data.byteLength,
        ),
      );
      payload.origRgbaBuffer = origRgbaCopy;
      transferList.push(origRgbaCopy);
    }
    const res = await runWorkerJob("compress", payload, transferList);
    if (item.id) markWorkerItemCached(item.id);
    return {
      outputBlob: new Blob([res.outAb], { type: res.mimeType }),
      outBytes: new Uint8Array(res.outAb),
      decFormat: res.decFormat,
    };
  } catch (workerErr) {
    console.warn(
      "Worker compression failed, falling back to main thread:",
      workerErr,
    );
    return await compressOnMainThread(item, origImageData);
  }
}
