export const CDN_BASE = "https://cdn.jsdelivr.net/npm";

const WORKER_SOURCE = `
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm';
  const codecCache = {};
  const itemCache = new Map();
  let legacyLibsPromise = null;

  async function ensureLegacyLibs() {
    if (typeof self.UPNG !== 'undefined' && typeof self.pako !== 'undefined') return;
    if (!legacyLibsPromise) {
      legacyLibsPromise = (async () => {
        if (typeof self.window === 'undefined') {
          self.window = self;
        }
        const urls = [
          'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
          'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.min.js',
          'https://cdn.jsdelivr.net/npm/optipng-js@0.1.2/optipng.min.js'
        ];
        for (const u of urls) {
          try {
            const res = await fetch(u);
            if (res.ok) {
              const code = await res.text();
              (0, eval)(code);
            }
          } catch (err) {
            console.warn('Legacy codec script fetch failed:', u, err);
          }
        }
      })();
    }
    return legacyLibsPromise;
  }

  function loadMod(key, url) {
    if (!codecCache[key]) {
      codecCache[key] = import(url);
    }
    return codecCache[key];
  }

  function loadImageQ() {
    return loadMod('imageQ', CDN_BASE + '/image-q@4.0.0/+esm');
  }

  function toTightAb(u8) {
    if (u8 instanceof ArrayBuffer) return u8.slice(0);
    if (ArrayBuffer.isView(u8)) {
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    }
    return new ArrayBuffer(0);
  }

  async function decodeBytes(rawBytes, format) {
    const ab = toTightAb(rawBytes);
    if (format === 'webp') {
      const mod = await loadMod('webpMod', CDN_BASE + '/@jsquash/webp@1.5.0/+esm');
      const dec = mod.decode || mod.default;
      return await dec(ab);
    } else if (format === 'png') {
      try {
        const mod = await loadMod('pngMod', CDN_BASE + '/@jsquash/png@3.1.1/+esm');
        const dec = mod.decode || mod.default;
        return await dec(ab);
      } catch (err) {
        console.warn('WASM PNG decode failed, falling back to UPNG:', err);
        await ensureLegacyLibs();
        const decoded = self.UPNG.decode(ab);
        const rgba = self.UPNG.toRGBA8(decoded)[0];
        return new ImageData(new Uint8ClampedArray(rgba), decoded.width, decoded.height);
      }
    } else {
      const mod = await loadMod('jpegMod', CDN_BASE + '/@jsquash/jpeg@1.6.0/+esm');
      const dec = mod.decode || mod.default;
      return await dec(ab, { preserveOrientation: true });
    }
  }

  self.onmessage = async (e) => {
    const { jobId, action, payload } = e.data || {};
    try {
      if (action === 'evict') {
        if (payload && payload.itemId) {
          itemCache.delete(payload.itemId);
        }
        if (jobId) self.postMessage({ jobId, ok: true });
        return;
      }

      if (action === 'decode' || action === 'decodeBytes') {
        const rawBytes = new Uint8Array(payload.rawBuffer);
        const imgData = await decodeBytes(rawBytes, payload.format);
        if (action === 'decode' && payload.itemId) {
          const existing = itemCache.get(payload.itemId);
          itemCache.set(payload.itemId, {
            rawBytes: existing ? existing.rawBytes : new Uint8Array(rawBytes),
            origImageData: new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height)
          });
        }
        self.postMessage(
          {
            jobId,
            ok: true,
            width: imgData.width,
            height: imgData.height,
            rgbaBuffer: imgData.data.buffer
          },
          [imgData.data.buffer]
        );
        return;
      }

      if (action === 'compress') {
        const { itemId, method, format, quality, paletteColors, width, height, rawBuffer, origRgbaBuffer } = payload || {};
        let cached = itemId ? itemCache.get(itemId) : null;
        if (!cached && rawBuffer) {
          cached = {
            rawBytes: new Uint8Array(rawBuffer),
            origImageData: origRgbaBuffer ? new ImageData(new Uint8ClampedArray(origRgbaBuffer), width, height) : null
          };
          if (itemId) itemCache.set(itemId, cached);
        } else if (cached && !cached.origImageData && origRgbaBuffer) {
          cached.origImageData = new ImageData(new Uint8ClampedArray(origRgbaBuffer), width, height);
        }
        if (!cached || !cached.rawBytes) {
          throw new Error('Missing image buffer for compression');
        }
        const rawBytes = cached.rawBytes;
        const needsPixels =
          method === 'mozjpeg' ||
          method === 'upng' ||
          method === 'wuquant' ||
          method === 'webp' ||
          method === 'webp_lossless';
        if (needsPixels && !cached.origImageData) {
          const fallbackFormat = format || (method === 'mozjpeg' ? 'jpeg' : 'png');
          cached.origImageData = await decodeBytes(rawBytes, fallbackFormat);
        }
        const origImageData = cached.origImageData;

        let outAb = null;
        let mimeType = 'image/jpeg';
        let decFormat = 'jpeg';

        if (method === 'mozjpeg') {
          const jpegMod = await loadMod('jpegMod', CDN_BASE + '/@jsquash/jpeg@1.6.0/+esm');
          const encodeJpeg = jpegMod.encode || jpegMod.default;
          const q = Math.max(1, Math.min(100, quality || 70));

          outAb = await encodeJpeg(origImageData, {
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
            chroma_quality: q
          });
          mimeType = 'image/jpeg';
          decFormat = 'jpeg';
        } else if (method === 'oxipng') {
          const oxiMod = await loadMod('oxiMod', CDN_BASE + '/@jsquash/oxipng@2.3.0/+esm');
          const oxipngOptimise = oxiMod.optimise || oxiMod.default;
          const optAb = await oxipngOptimise(toTightAb(rawBytes), {
            level: 4,
            interlace: false,
            optimiseAlpha: true
          });
          outAb = optAb.byteLength < rawBytes.byteLength ? optAb : toTightAb(rawBytes);
          mimeType = 'image/png';
          decFormat = 'png';
        } else if (method === 'optipng') {
          await ensureLegacyLibs();
          let candidateAb = toTightAb(rawBytes);
          if (typeof self.optipng === 'function') {
            const res = self.optipng(new Uint8Array(rawBytes), ['-o2', '-i0', '-strip', 'all']);
            if (res && res.data && res.data.byteLength > 0 && res.data.byteLength < rawBytes.byteLength) {
              candidateAb = toTightAb(new Uint8Array(res.data));
            }
          }
          outAb = candidateAb;
          mimeType = 'image/png';
          decFormat = 'png';
        } else if (method === 'upng') {
          await ensureLegacyLibs();
          const numColors = Math.max(16, Math.min(256, paletteColors || 256));
          const rgbaAb = toTightAb(new Uint8Array(origImageData.data.buffer, origImageData.data.byteOffset, origImageData.data.byteLength));
          outAb = self.UPNG.encode([rgbaAb], origImageData.width, origImageData.height, numColors);
          mimeType = 'image/png';
          decFormat = 'png';
        } else if (method === 'wuquant') {
          await ensureLegacyLibs();
          const numColors = Math.max(16, Math.min(256, paletteColors || 256));
          const iq = await loadImageQ();
          const inContainer = iq.utils.PointContainer.fromUint8Array(origImageData.data, origImageData.width, origImageData.height);
          const palette = await iq.buildPalette([inContainer], {
            colorDistanceFormula: 'euclidean-bt709',
            paletteQuantization: 'wuquant',
            colors: numColors
          });
          const outContainer = await iq.applyPalette(inContainer, palette, {
            colorDistanceFormula: 'euclidean-bt709',
            imageQuantization: 'floyd-steinberg'
          });
          const ditheredRgba = outContainer.toUint8Array();
          outAb = self.UPNG.encode([toTightAb(ditheredRgba)], origImageData.width, origImageData.height, numColors);
          mimeType = 'image/png';
          decFormat = 'png';
        } else if (method === 'webp' || method === 'webp_lossless') {
          const webpMod = await loadMod('webpMod', CDN_BASE + '/@jsquash/webp@1.5.0/+esm');
          const encodeWebp = webpMod.encode || webpMod.default;
          const isLossless = method === 'webp_lossless';
          const q = Math.max(1, Math.min(100, quality || 70));

          outAb = await encodeWebp(origImageData, {
            quality: isLossless ? 75 : q,
            lossless: isLossless ? 1 : 0,
            method: 4,
            alpha_quality: isLossless ? 100 : Math.min(100, q + 15),
            near_lossless: 100,
            use_sharp_yuv: isLossless ? 0 : 1
          });
          mimeType = 'image/webp';
          decFormat = 'webp';
        }

        self.postMessage(
          {
            jobId,
            ok: true,
            mimeType,
            decFormat,
            outAb
          },
          [outAb]
        );
      }
    } catch (err) {
      self.postMessage({ jobId, ok: false, error: err ? String(err.message || err) : 'Worker error' });
    }
  };
`;

const WORKER_TIMEOUT_MS = 45000;
let codecWorker = null;
let nextWorkerJobId = 1;
const pendingWorkerJobs = new Map();
const workerCachedItems = new Set();

function getCodecWorker() {
  if (codecWorker !== null) return codecWorker;
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    codecWorker = false;
    return false;
  }
  try {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = (e) => {
      const { jobId, ok, error, ...rest } = e.data || {};
      const pending = pendingWorkerJobs.get(jobId);
      if (!pending) return;
      if (pending.timer !== null) {
        clearTimeout(pending.timer);
      }
      pendingWorkerJobs.delete(jobId);
      if (ok) pending.resolve(rest);
      else pending.reject(new Error(error || "Worker task failed"));
    };
    w.onerror = () => {
      codecWorker = false;
      workerCachedItems.clear();
      for (const [, p] of pendingWorkerJobs) {
        if (p.timer !== null) clearTimeout(p.timer);
        p.reject(new Error("Worker initialization error"));
      }
      pendingWorkerJobs.clear();
    };
    codecWorker = w;
  } catch (err) {
    console.warn(
      "Worker initialization blocked, using main thread fallback:",
      err,
    );
    codecWorker = false;
  }
  return codecWorker;
}

export function runWorkerJob(action, payload, transferList = []) {
  const worker = getCodecWorker();
  if (!worker) return Promise.reject(new Error("Worker unavailable"));
  const jobId = nextWorkerJobId++;
  return new Promise((resolve, reject) => {
    let timer = null;
    if (WORKER_TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        const pending = pendingWorkerJobs.get(jobId);
        if (pending) {
          pendingWorkerJobs.delete(jobId);
          pending.reject(
            new Error(`Worker task "${action}" timed out (45s limit exceeded)`),
          );
          terminateCodecWorker();
        }
      }, WORKER_TIMEOUT_MS);
    }
    pendingWorkerJobs.set(jobId, { resolve, reject, timer });
    try {
      worker.postMessage(
        { jobId, action, payload },
        Array.isArray(transferList) ? transferList : [],
      );
    } catch (err) {
      if (timer !== null) clearTimeout(timer);
      pendingWorkerJobs.delete(jobId);
      reject(err);
    }
  });
}

export function isWorkerItemCached(itemId) {
  if (!itemId) return false;
  return workerCachedItems.has(itemId);
}

export function markWorkerItemCached(itemId) {
  if (!itemId) return;
  workerCachedItems.add(itemId);
}

export function evictWorkerItem(itemId) {
  if (!itemId || !workerCachedItems.has(itemId)) return;
  workerCachedItems.delete(itemId);
  runWorkerJob("evict", { itemId }).catch((err) => {
    console.warn("Worker cache eviction failed:", err);
  });
}

export function terminateCodecWorker() {
  if (codecWorker && typeof codecWorker.terminate === "function") {
    codecWorker.terminate();
  }
  codecWorker = null;
  workerCachedItems.clear();
  for (const [, p] of pendingWorkerJobs) {
    if (p.timer !== null && p.timer !== undefined) clearTimeout(p.timer);
    p.reject(new Error("Codec worker terminated"));
  }
  pendingWorkerJobs.clear();
}
