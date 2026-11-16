import {
  ALGORITHMS,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_QUALITY,
  PALETTE_STEPS,
  QUALITY_STEPS,
} from "./constants.js";

export function getCompatibleAlgorithms(format) {
  const norm = String(format || "")
    .toLowerCase()
    .trim();
  if (norm === "png") {
    return ["oxipng", "optipng", "upng", "wuquant", "webp", "webp_lossless"];
  }
  if (norm === "webp") {
    return ["webp", "webp_lossless"];
  }
  return ["mozjpeg", "webp", "webp_lossless"];
}

export function getDefaultAlgorithm(format) {
  const norm = String(format || "")
    .toLowerCase()
    .trim();
  if (norm === "png") return "oxipng";
  if (norm === "webp") return "webp";
  return "mozjpeg";
}

export function isLosslessAlgorithm(algoKey) {
  const spec = ALGORITHMS[algoKey];
  return spec ? spec.mode === "lossless" : false;
}

export function isByteLevelAlgorithm(algoKey) {
  return isLosslessAlgorithm(algoKey);
}

export function isPaletteAlgorithm(algoKey) {
  const spec = ALGORITHMS[algoKey];
  return spec ? spec.mode === "palette" : false;
}

/**
 * Resolve algorithms supported by every format in a batch selection.
 * @param {string[]} formats
 * @returns {string[]}
 */
export function getBatchCompatibleAlgorithms(formats) {
  if (!Array.isArray(formats) || formats.length === 0) return [];
  const uniqueFormats = Array.from(
    new Set(
      formats.map((fmt) =>
        String(fmt || "")
          .toLowerCase()
          .trim(),
      ),
    ),
  );
  const lists = uniqueFormats.map((fmt) => getCompatibleAlgorithms(fmt));
  const first = lists[0] || [];
  return first.filter((algoKey) =>
    lists.every((list) => list.includes(algoKey)),
  );
}

/**
 * Group compatible algorithm options for UI select dropdowns.
 * @param {string[]} compatibleKeys
 */
export function getAlgorithmGroupsForKeys(compatibleKeys) {
  if (!Array.isArray(compatibleKeys)) return [];
  const groupsMap = new Map();

  for (const key of compatibleKeys) {
    const algo = ALGORITHMS[key];
    if (!algo) continue;
    const groupTitle = algo.group || "Algorithms";
    if (!groupsMap.has(groupTitle)) {
      groupsMap.set(groupTitle, []);
    }
    groupsMap.get(groupTitle).push({ value: key, label: algo.label });
  }

  return Array.from(groupsMap.entries()).map(([title, items]) => ({
    title,
    items,
  }));
}

export function getAlgorithmGroups(format) {
  return getAlgorithmGroupsForKeys(getCompatibleAlgorithms(format));
}

/**
 * Format a compact output badge for queue rows (e.g. "WebP 70", "Oxipng").
 * @param {{ method?: string, quality?: number, paletteColors?: number }} item
 * @returns {string}
 */
export function getAlgorithmBadge(item) {
  if (!item || !item.method) return "";
  const spec = ALGORITHMS[item.method];
  const label = spec ? spec.label : item.method;
  if (isLosslessAlgorithm(item.method)) {
    return item.method === "webp_lossless" ? "WebP Lossless" : label;
  }
  if (isPaletteAlgorithm(item.method)) {
    return `${label} ${item.paletteColors || DEFAULT_PALETTE_COLORS}`;
  }
  return `${label} ${item.quality || DEFAULT_QUALITY}`;
}

export function snapToSteps(val, isPalette) {
  const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
  const numericVal = Number.isFinite(val) ? val : steps[0];
  let best = steps[0];
  let minDiff = Infinity;

  for (const step of steps) {
    const diff = Math.abs(step - numericVal);
    if (diff < minDiff) {
      minDiff = diff;
      best = step;
    }
  }
  return best;
}

export function getStepIndex(val, isPalette) {
  const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
  const snapped = snapToSteps(val, isPalette);
  const idx = steps.indexOf(snapped);
  return idx >= 0 ? idx : 0;
}

export function getStepValueByRatio(ratio, isPalette) {
  const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
  const clampedRatio = Math.max(
    0,
    Math.min(1, Number.isFinite(ratio) ? ratio : 0),
  );
  const rawIdx = Math.round(clampedRatio * steps.length) - 1;
  const stepIdx = Math.max(0, Math.min(steps.length - 1, rawIdx));
  return steps[stepIdx];
}

export function getNextStepValue(currentVal, delta, isPalette) {
  const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
  const currentIdx = getStepIndex(currentVal, isPalette);
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const nextIdx = Math.max(
    0,
    Math.min(steps.length - 1, currentIdx + safeDelta),
  );
  return steps[nextIdx];
}

export function getStepProgressPercent(val, isPalette) {
  const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
  const snapped = snapToSteps(val, isPalette);
  const idx = getStepIndex(snapped, isPalette);
  return ((idx + 1) / steps.length) * 100;
}

export function getItemDegree(item) {
  if (!item) return DEFAULT_QUALITY;
  return isPaletteAlgorithm(item.method)
    ? item.paletteColors || DEFAULT_PALETTE_COLORS
    : item.quality || DEFAULT_QUALITY;
}

export function computeItemDegreePatch(item, val) {
  if (!item) {
    return { changed: false, patch: null };
  }
  if (isPaletteAlgorithm(item.method)) {
    const clamped = snapToSteps(val, true);
    if (item.paletteColors === clamped) {
      return { changed: false, patch: null };
    }
    return { changed: true, patch: { paletteColors: clamped } };
  }
  if (!isLosslessAlgorithm(item.method)) {
    const clamped = snapToSteps(val, false);
    if (item.quality === clamped) {
      return { changed: false, patch: null };
    }
    return { changed: true, patch: { quality: clamped } };
  }
  return { changed: false, patch: null };
}
