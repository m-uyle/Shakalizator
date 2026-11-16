export const HARMONIC_STEPS = Object.freeze([
  0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0,
  12.0, 16.0,
]);

const DEFAULT_ZOOM_STEP_INDEX = 6;
const VIEWPORT_MARGIN_PX = 64;
const PAN_VISIBLE_EDGE_PX = 48;

export { DEFAULT_ZOOM_STEP_INDEX };

function normalizeZero(val) {
  return val === 0 ? 0 : val;
}

export function findClosestZoomStepIndex(targetScale) {
  if (!Number.isFinite(targetScale) || targetScale <= 0) {
    return DEFAULT_ZOOM_STEP_INDEX;
  }
  let bestIdx = DEFAULT_ZOOM_STEP_INDEX;
  let minDiff = Infinity;
  for (let idx = 0; idx < HARMONIC_STEPS.length; idx += 1) {
    const diff = Math.abs(HARMONIC_STEPS[idx] - targetScale);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function findFitZoomStepIndex(targetScale) {
  if (!Number.isFinite(targetScale) || targetScale <= HARMONIC_STEPS[0]) {
    return 0;
  }
  let bestIdx = 0;
  for (let idx = 0; idx < HARMONIC_STEPS.length; idx += 1) {
    if (HARMONIC_STEPS[idx] <= targetScale) {
      bestIdx = idx;
    } else {
      break;
    }
  }
  return bestIdx;
}

export function computeFitTransform(options = {}) {
  const { imgW, imgH, viewportW, viewportH, sidebarOffset } = options || {};
  if (
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    imgW <= 0 ||
    imgH <= 0
  ) {
    return null;
  }
  const safeSidebar = Number.isFinite(sidebarOffset) ? sidebarOffset : 0;
  const availableW = Math.max(
    1,
    (Number.isFinite(viewportW) ? viewportW : 1) - safeSidebar,
  );
  const availableH = Math.max(1, Number.isFinite(viewportH) ? viewportH : 1);
  const usableW = Math.max(1, availableW - VIEWPORT_MARGIN_PX);
  const usableH = Math.max(1, availableH - VIEWPORT_MARGIN_PX);
  const rawScale = Math.min(
    1.0,
    Math.min(usableW / imgW, usableH / imgH),
  );
  const clampedScale = Math.max(HARMONIC_STEPS[0], rawScale);
  const zoomStepIndex = findFitZoomStepIndex(clampedScale);
  const zoom = HARMONIC_STEPS[zoomStepIndex];
  const panX = normalizeZero(
    Math.round(safeSidebar + (availableW - imgW * zoom) / 2),
  );
  const panY = normalizeZero(Math.round((availableH - imgH * zoom) / 2));

  return { zoomStepIndex, zoom, panX, panY };
}

export function computeWheelZoomTransform(options = {}) {
  const { currentZoom, currentStepIndex, panX, panY, mouseX, mouseY, deltaY } =
    options || {};

  if (!Number.isFinite(deltaY) || deltaY === 0) return null;

  const safeStepIdx = Number.isFinite(currentStepIndex)
    ? currentStepIndex
    : findClosestZoomStepIndex(currentZoom);

  const stepDelta = deltaY < 0 ? 1 : -1;
  const newIdx = Math.max(
    0,
    Math.min(HARMONIC_STEPS.length - 1, safeStepIdx + stepDelta),
  );
  if (newIdx === safeStepIdx) return null;

  const safeOldZoom =
    Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1.0;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;
  const safeMouseX = Number.isFinite(mouseX) ? mouseX : 0;
  const safeMouseY = Number.isFinite(mouseY) ? mouseY : 0;

  const newZoom = HARMONIC_STEPS[newIdx];
  const imgX = (safeMouseX - safePanX) / safeOldZoom;
  const imgY = (safeMouseY - safePanY) / safeOldZoom;

  return {
    zoomStepIndex: newIdx,
    zoom: newZoom,
    panX: normalizeZero(Math.round(safeMouseX - imgX * newZoom)),
    panY: normalizeZero(Math.round(safeMouseY - imgY * newZoom)),
  };
}

export function computePinchZoomTransform(options = {}) {
  const {
    currentZoom,
    currentStepIndex,
    panX,
    panY,
    centerX,
    centerY,
    targetZoom,
  } = options || {};

  if (!Number.isFinite(targetZoom) || targetZoom <= 0) return null;

  const bestIdx = findClosestZoomStepIndex(targetZoom);
  const safeStepIdx = Number.isFinite(currentStepIndex)
    ? currentStepIndex
    : findClosestZoomStepIndex(currentZoom);

  if (bestIdx === safeStepIdx) return null;

  const safeOldZoom =
    Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1.0;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;
  const safeCenterX = Number.isFinite(centerX) ? centerX : 0;
  const safeCenterY = Number.isFinite(centerY) ? centerY : 0;

  const newZoom = HARMONIC_STEPS[bestIdx];
  const imgX = (safeCenterX - safePanX) / safeOldZoom;
  const imgY = (safeCenterY - safePanY) / safeOldZoom;

  return {
    zoomStepIndex: bestIdx,
    zoom: newZoom,
    panX: normalizeZero(Math.round(safeCenterX - imgX * newZoom)),
    panY: normalizeZero(Math.round(safeCenterY - imgY * newZoom)),
  };
}

export function formatZoomPercent(zoom) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1.0;
  return `${Math.round(safeZoom * 100)}%`;
}

/**
 * Clamp pan coordinates so at least a visible margin of the image remains inside the viewport.
 */
export function clampPanToViewport(options = {}) {
  const { panX, panY, imgW, imgH, zoom, viewportW, viewportH } = options || {};
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;

  if (
    !Number.isFinite(imgW) ||
    !Number.isFinite(imgH) ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  ) {
    return {
      panX: normalizeZero(Math.round(safePanX)),
      panY: normalizeZero(Math.round(safePanY)),
    };
  }

  const safeViewportW = Number.isFinite(viewportW) ? viewportW : 0;
  const safeViewportH = Number.isFinite(viewportH) ? viewportH : 0;

  const scaledW = imgW * zoom;
  const scaledH = imgH * zoom;
  const keepX = Math.min(PAN_VISIBLE_EDGE_PX, scaledW * 0.5);
  const keepY = Math.min(PAN_VISIBLE_EDGE_PX, scaledH * 0.5);
  const minPanX = -(scaledW - keepX);
  const maxPanX = safeViewportW - keepX;
  const effectiveMaxX = Math.max(minPanX, maxPanX);
  const minPanY = -(scaledH - keepY);
  const maxPanY = safeViewportH - keepY;
  const effectiveMaxY = Math.max(minPanY, maxPanY);

  return {
    panX: normalizeZero(
      Math.round(Math.max(minPanX, Math.min(effectiveMaxX, safePanX))),
    ),
    panY: normalizeZero(
      Math.round(Math.max(minPanY, Math.min(effectiveMaxY, safePanY))),
    ),
  };
}

/**
 * Compute transform that zooms directly to an exact scale step anchored at the cursor.
 */
export function computeExactZoomTransform(options = {}) {
  const { currentZoom, panX, panY, cursorX, cursorY, targetScale } =
    options || {};

  const stepIdx = findClosestZoomStepIndex(targetScale);
  const nextZoom = HARMONIC_STEPS[stepIdx];
  const safeOldZoom =
    Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : 1.0;
  const safePanX = Number.isFinite(panX) ? panX : 0;
  const safePanY = Number.isFinite(panY) ? panY : 0;
  const safeCursorX = Number.isFinite(cursorX) ? cursorX : 0;
  const safeCursorY = Number.isFinite(cursorY) ? cursorY : 0;

  const imgX = (safeCursorX - safePanX) / safeOldZoom;
  const imgY = (safeCursorY - safePanY) / safeOldZoom;

  return {
    zoomStepIndex: stepIdx,
    zoom: nextZoom,
    panX: normalizeZero(Math.round(safeCursorX - imgX * nextZoom)),
    panY: normalizeZero(Math.round(safeCursorY - imgY * nextZoom)),
  };
}
