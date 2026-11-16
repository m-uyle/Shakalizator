/**
 * Create an accessible discrete-step pill scrubber primitive.
 * @param {{
 *   ariaLabel?: string,
 *   min?: number,
 *   max?: number,
 *   value?: number,
 *   onScrubRatio?: (ratio: number) => void,
 *   onStepDelta?: (delta: number) => void,
 *   onStepEdge?: (edge: "min" | "max") => void
 * }} [options]
 */
export function createScrubber(options = {}) {
  const {
    ariaLabel = "Value scrubber",
    min = 10,
    max = 100,
    value = 70,
    onScrubRatio = null,
    onStepDelta = null,
    onStepEdge = null,
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const track = document.createElement("div");
  track.className = "ui-scrubber";
  track.setAttribute("role", "slider");
  track.setAttribute("tabindex", "0");
  track.setAttribute("aria-label", ariaLabel);
  track.setAttribute("aria-valuemin", String(min));
  track.setAttribute("aria-valuemax", String(max));
  track.setAttribute("aria-valuenow", String(value));

  const fill = document.createElement("div");
  fill.className = "ui-scrubber__fill";

  const valueText = document.createElement("span");
  valueText.className = "ui-scrubber__value";
  valueText.textContent = String(value);

  const emptyText = document.createElement("span");
  emptyText.className = "ui-scrubber__empty is-hidden";
  emptyText.textContent = "Lossless";

  track.appendChild(fill);
  track.appendChild(valueText);
  track.appendChild(emptyText);

  let isDisabled = false;
  let isScrubbing = false;

  const handlePointer = (event) => {
    if (isDisabled || typeof onScrubRatio !== "function") return;
    const rect = track.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 1;
    const clientX =
      event.clientX !== undefined
        ? event.clientX
        : ((event.touches?.[0] || event.changedTouches?.[0])?.clientX ??
          rect.left);
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / width));
    onScrubRatio(ratio);
  };

  const stopScrubbing = (event) => {
    if (!isScrubbing) return;
    isScrubbing = false;
    track.classList.remove("is-scrubbing");
    if (
      event &&
      event.pointerId !== undefined &&
      typeof track.releasePointerCapture === "function" &&
      track.hasPointerCapture(event.pointerId)
    ) {
      try {
        track.releasePointerCapture(event.pointerId);
      } catch (err) {
        void err;
      }
    }
  };

  track.addEventListener(
    "pointerdown",
    (event) => {
      if (isDisabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      isScrubbing = true;
      track.classList.add("is-scrubbing");
      track.focus();
      if (typeof track.setPointerCapture === "function") {
        try {
          track.setPointerCapture(event.pointerId);
        } catch {
          // ignore potential pointer capture failure in synthetic/mock environments
        }
      }
      handlePointer(event);
      event.preventDefault();
    },
    { signal },
  );

  track.addEventListener(
    "pointermove",
    (event) => {
      if (isScrubbing) handlePointer(event);
    },
    { signal },
  );

  track.addEventListener("pointerup", stopScrubbing, { signal });
  track.addEventListener("pointercancel", stopScrubbing, { signal });
  track.addEventListener("lostpointercapture", stopScrubbing, { signal });
  window.addEventListener("blur", () => stopScrubbing(), { signal });

  const LARGE_STEP_DELTA = 2;

  track.addEventListener(
    "keydown",
    (event) => {
      if (isDisabled) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        if (typeof onStepDelta !== "function") return;
        event.preventDefault();
        onStepDelta(-1);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        if (typeof onStepDelta !== "function") return;
        event.preventDefault();
        onStepDelta(1);
      } else if (event.key === "PageDown") {
        if (typeof onStepDelta !== "function") return;
        event.preventDefault();
        onStepDelta(-LARGE_STEP_DELTA);
      } else if (event.key === "PageUp") {
        if (typeof onStepDelta !== "function") return;
        event.preventDefault();
        onStepDelta(LARGE_STEP_DELTA);
      } else if (event.key === "Home") {
        event.preventDefault();
        if (typeof onStepEdge === "function") {
          onStepEdge("min");
        } else if (typeof onStepDelta === "function") {
          onStepDelta(-Number.MAX_SAFE_INTEGER);
        }
      } else if (event.key === "End") {
        event.preventDefault();
        if (typeof onStepEdge === "function") {
          onStepEdge("max");
        } else if (typeof onStepDelta === "function") {
          onStepDelta(Number.MAX_SAFE_INTEGER);
        }
      }
    },
    { signal },
  );

  return {
    element: track,
    update(options = {}) {
      const {
        value: nextVal,
        min: nextMin,
        max: nextMax,
        percent,
        isFull,
        disabled,
        emptyLabel = "Lossless",
        ariaLabel: nextAriaLabel,
      } = options || {};

      if (nextAriaLabel) {
        track.setAttribute("aria-label", nextAriaLabel);
      }
      isDisabled = Boolean(disabled);
      if (isDisabled) {
        track.classList.add("is-disabled");
        track.setAttribute("aria-disabled", "true");
        track.setAttribute("tabindex", "-1");
        track.removeAttribute("aria-valuenow");
        track.removeAttribute("aria-valuemin");
        track.removeAttribute("aria-valuemax");
        track.setAttribute("aria-valuetext", emptyLabel || "Unavailable");
        fill.classList.add("is-hidden");
        valueText.classList.add("is-hidden");
        emptyText.textContent = emptyLabel;
        emptyText.classList.toggle("is-hidden", !emptyLabel);
        return;
      }

      track.classList.remove("is-disabled");
      track.setAttribute("aria-disabled", "false");
      track.setAttribute("tabindex", "0");
      if (Number.isFinite(nextMin))
        track.setAttribute("aria-valuemin", String(nextMin));
      if (Number.isFinite(nextMax))
        track.setAttribute("aria-valuemax", String(nextMax));
      if (Number.isFinite(nextVal)) {
        track.setAttribute("aria-valuenow", String(nextVal));
        const currentLabel = (
          nextAriaLabel ||
          track.getAttribute("aria-label") ||
          ""
        ).toLowerCase();
        const valueFormatted = currentLabel.includes("quality")
          ? `${nextVal}%`
          : currentLabel.includes("color") || currentLabel.includes("palette")
            ? `${nextVal} colors`
            : String(nextVal);
        track.setAttribute("aria-valuetext", valueFormatted);
        valueText.textContent = String(nextVal);
      }
      if (Number.isFinite(percent)) {
        track.style.setProperty("--scrubber-progress", `${percent}%`);
      }

      emptyText.classList.add("is-hidden");
      fill.classList.remove("is-hidden");
      fill.classList.toggle("is-full", Boolean(isFull));
      valueText.classList.remove("is-hidden");
    },
    destroy() {
      isScrubbing = false;
      controller.abort();
    },
  };
}
