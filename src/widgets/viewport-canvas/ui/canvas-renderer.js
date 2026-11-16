import { computeDiffPixels } from "../../../core/compression/index.js";

const CHECKER_TILE_PX = 12;

let cachedCheckerKey = "";
let cachedCheckerPattern = null;

function getCheckerPattern(ctx, surfaceColor, checkerColor) {
  const key = `${surfaceColor}|${checkerColor}`;
  if (cachedCheckerPattern && cachedCheckerKey === key) {
    return cachedCheckerPattern;
  }
  const tile = document.createElement("canvas");
  tile.width = CHECKER_TILE_PX * 2;
  tile.height = CHECKER_TILE_PX * 2;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  tctx.fillStyle = surfaceColor;
  tctx.fillRect(0, 0, tile.width, tile.height);
  tctx.fillStyle = checkerColor;
  tctx.fillRect(0, 0, CHECKER_TILE_PX, CHECKER_TILE_PX);
  tctx.fillRect(
    CHECKER_TILE_PX,
    CHECKER_TILE_PX,
    CHECKER_TILE_PX,
    CHECKER_TILE_PX,
  );

  cachedCheckerPattern = ctx.createPattern(tile, "repeat");
  cachedCheckerKey = key;
  return cachedCheckerPattern;
}

const DEFAULT_CANVAS_SHADOW = {
  offsetX: 0,
  offsetY: 0,
  blur: 0,
  color: "transparent",
};

/**
 * Parse a CSS shadow token value (`offsetX offsetY blur color`) for Canvas 2D.
 * @param {string} raw
 */
function parseCanvasShadowToken(raw) {
  if (!raw) return DEFAULT_CANVAS_SHADOW;
  const colorMatch = raw.match(
    /(?:rgba?|hsla?|oklch)\([^)]+\)|#[0-9a-f]{3,8}/i,
  );
  const color = colorMatch ? colorMatch[0] : DEFAULT_CANVAS_SHADOW.color;
  const numericPart = colorMatch ? raw.replace(colorMatch[0], " ") : raw;
  const lengths = numericPart
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((value) => Number.isFinite(value));
  return {
    offsetX: lengths[0] ?? 0,
    offsetY: lengths[1] ?? 0,
    blur: lengths[2] ?? 0,
    color,
  };
}

export function buildDiffCanvas(item, origImg, compImg) {
  if (!item || !origImg || !compImg) return null;
  const w =
    origImg.naturalWidth || origImg.width || (item && item.origWidth) || 0;
  const h =
    origImg.naturalHeight || origImg.height || (item && item.origHeight) || 0;
  if (!w || !h) return null;

  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = w;
  diffCanvas.height = h;
  const dctx = diffCanvas.getContext("2d", { willReadFrequently: true });

  let dataA = null;
  let dataB = null;
  if (
    item.origImageData &&
    item.compImageData &&
    item.origImageData.data.length === item.compImageData.data.length
  ) {
    dataA = item.origImageData.data;
    dataB = item.compImageData.data;
  } else {
    const cA = document.createElement("canvas");
    cA.width = w;
    cA.height = h;
    const cB = document.createElement("canvas");
    cB.width = w;
    cB.height = h;
    cA.getContext("2d").drawImage(origImg, 0, 0, w, h);
    cB.getContext("2d").drawImage(compImg, 0, 0, w, h);
    dataA = cA.getContext("2d").getImageData(0, 0, w, h).data;
    dataB = cB.getContext("2d").getImageData(0, 0, w, h).data;
  }

  const diffPixels = computeDiffPixels(dataA, dataB);
  const diffData = dctx.createImageData(w, h);
  diffData.data.set(diffPixels);
  dctx.putImageData(diffData, 0, 0);
  return diffCanvas;
}

export function drawViewportCanvas({
  canvas,
  ctx,
  state,
  origImg,
  compImg,
  diffCanvas,
  hasAlpha = false,
}) {
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cw, ch);

  if (!origImg) {
    ctx.restore();
    return;
  }

  const px = Math.round(Number.isFinite(state?.panX) ? state.panX : 0);
  const py = Math.round(Number.isFinite(state?.panY) ? state.panY : 0);
  const zoom =
    Number.isFinite(state?.zoom) && state.zoom > 0 ? state.zoom : 1.0;

  ctx.imageSmoothingEnabled = zoom < 1.0;
  ctx.translate(px, py);
  ctx.scale(zoom, zoom);

  const w = origImg.naturalWidth || origImg.width || 0;
  const h = origImg.naturalHeight || origImg.height || 0;
  if (!w || !h) {
    ctx.restore();
    return;
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const surfaceColor = rootStyle.getPropertyValue("--surface-canvas").trim();
  const checkerColor = rootStyle.getPropertyValue("--surface-checker").trim();
  const canvasShadow = parseCanvasShadowToken(
    rootStyle.getPropertyValue("--elevation-canvas").trim(),
  );

  ctx.save();
  ctx.shadowColor = canvasShadow.color;
  ctx.shadowBlur = canvasShadow.blur;
  ctx.shadowOffsetX = canvasShadow.offsetX;
  ctx.shadowOffsetY = canvasShadow.offsetY;
  ctx.fillStyle = surfaceColor;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (hasAlpha && !state.isDiffActive && checkerColor) {
    const checkerPattern = getCheckerPattern(ctx, surfaceColor, checkerColor);
    if (checkerPattern) {
      if (
        typeof checkerPattern.setTransform === "function" &&
        typeof DOMMatrix !== "undefined"
      ) {
        checkerPattern.setTransform(new DOMMatrix().scale(1 / zoom, 1 / zoom));
      }
      ctx.fillStyle = checkerPattern;
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (state.isHoldingBlink) {
    ctx.drawImage(origImg, 0, 0, w, h);
  } else if (state.isDiffActive) {
    ctx.drawImage(diffCanvas || compImg || origImg, 0, 0, w, h);
  } else {
    ctx.drawImage(compImg || origImg, 0, 0, w, h);
  }

  ctx.restore();
}
