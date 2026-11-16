import { DIFF_AMPLIFICATION_GAIN } from "./constants.js";

/**
 * Compute amplified RGBA difference buffer between original and compressed pixels.
 * @param {Uint8ClampedArray} origData
 * @param {Uint8ClampedArray} compData
 * @param {number} gain
 * @returns {Uint8ClampedArray}
 */
export function computeDiffPixels(
  origData,
  compData,
  gain = DIFF_AMPLIFICATION_GAIN,
) {
  if (
    !origData ||
    !compData ||
    !Number.isFinite(origData.length) ||
    !Number.isFinite(compData.length)
  ) {
    return new Uint8ClampedArray(0);
  }

  const rawLen = Math.min(origData.length, compData.length);
  const len = rawLen - (rawLen % 4);
  const out = new Uint8ClampedArray(len);
  if (len === 0) return out;

  const safeGain =
    Number.isFinite(gain) && gain > 0 ? gain : DIFF_AMPLIFICATION_GAIN;

  for (let i = 0; i < len; i += 4) {
    const a1 = origData[i + 3] / 255;
    const a2 = compData[i + 3] / 255;

    const dr = Math.abs(origData[i] * a1 - compData[i] * a2);
    const dg = Math.abs(origData[i + 1] * a1 - compData[i + 1] * a2);
    const db = Math.abs(origData[i + 2] * a1 - compData[i + 2] * a2);
    const da = Math.abs(origData[i + 3] - compData[i + 3]);

    out[i] = Math.min(255, Math.round((dr + da * 0.5) * safeGain));
    out[i + 1] = Math.min(255, Math.round((dg + da * 0.5) * safeGain));
    out[i + 2] = Math.min(255, Math.round((db + da * 0.5) * safeGain));
    out[i + 3] = 255;
  }

  return out;
}
