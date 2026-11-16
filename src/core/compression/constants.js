export const ALGORITHMS = Object.freeze({
  mozjpeg: Object.freeze({ label: "MozJPEG", category: "jpeg", group: "JPEG", mode: "quality", extension: "jpg" }),
  oxipng: Object.freeze({ label: "Oxipng", category: "png", group: "Lossless", mode: "lossless", extension: "png" }),
  optipng: Object.freeze({ label: "OptiPNG", category: "png", group: "Lossless", mode: "lossless", extension: "png" }),
  upng: Object.freeze({ label: "UPNG Quantizer", category: "png", group: "Palette (8-bit)", mode: "palette", extension: "png" }),
  wuquant: Object.freeze({ label: "WuQuant", category: "png", group: "Palette (8-bit)", mode: "palette", extension: "png" }),
  webp: Object.freeze({ label: "WebP", category: "webp", group: "WebP", mode: "quality", extension: "webp" }),
  webp_lossless: Object.freeze({ label: "WebP Lossless", category: "webp", group: "WebP", mode: "lossless", extension: "webp" }),
});

export const QUALITY_STEPS = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
export const PALETTE_STEPS = Object.freeze([16, 32, 48, 64, 96, 128, 160, 192, 224, 256]);

export const DEFAULT_QUALITY = 70;
export const DEFAULT_PALETTE_COLORS = 256;
export const DIFF_AMPLIFICATION_GAIN = 8;
export const RECOMPRESS_DEBOUNCE_MS = 220;

