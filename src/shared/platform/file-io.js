const DEMO_SAMPLE_SPECS = Object.freeze([
  {
    path: "../../../demo-samples/Shakal_DEMO_JPG.jpg",
    name: "Shakal_DEMO_JPG.jpg",
    type: "image/jpeg",
  },
  {
    path: "../../../demo-samples/Shakal_DEMO_PNG.png",
    name: "Shakal_DEMO_PNG.png",
    type: "image/png",
  },
]);

/**
 * Fetch bundled demo sample images and wrap them as standard File objects.
 * @returns {Promise<File[]>}
 */
export async function fetchDemoSampleFiles() {
  return await Promise.all(
    DEMO_SAMPLE_SPECS.map(async (spec) => {
      const url = new URL(spec.path, import.meta.url).href;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch demo sample: ${spec.name} (${response.status})`,
        );
      }
      const blob = await response.blob();
      return new File([blob], spec.name, { type: spec.type });
    }),
  );
}

export async function readFileAsUint8Array(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Invalid file object: arrayBuffer() is not supported");
  }
  const rawBuffer = await file.arrayBuffer();
  return new Uint8Array(rawBuffer);
}

export function createBlobAndUrl(rawBytes, mimeType) {
  const blob = new Blob([rawBytes], { type: mimeType });
  return {
    blob,
    url: URL.createObjectURL(blob),
  };
}

export function createObjectUrl(blob) {
  if (!blob) return "";
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url) {
  if (
    url &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("Cannot load image: URL is empty or undefined"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      img.onload = null;
      img.onerror = null;
      resolve(img);
    };
    img.onerror = (err) => {
      img.onload = null;
      img.onerror = null;
      reject(
        err instanceof Error
          ? err
          : new Error(`Failed to load image from "${url}"`),
      );
    };
    img.src = url;
  });
}

export function imageDataToDrawable(imageData) {
  if (!imageData || !imageData.width || !imageData.height) {
    throw new Error("Invalid ImageData supplied to imageDataToDrawable");
  }
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.naturalWidth = imageData.width;
  canvas.naturalHeight = imageData.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

const BLOB_REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob, filename) {
  if (!blob) return;
  const safeFilename = String(filename || "download");
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = safeFilename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, BLOB_REVOKE_DELAY_MS);
}

export async function createZipBlob(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("No entries provided to createZipBlob");
  }
  if (typeof globalThis.JSZip !== "function") {
    throw new Error("JSZip library is not available");
  }
  const zip = new globalThis.JSZip();
  for (const entry of entries) {
    if (entry && entry.filename && entry.blob) {
      zip.file(entry.filename, entry.blob);
    }
  }
  return await zip.generateAsync({ type: "blob" });
}
