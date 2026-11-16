const TOOLTIP_SHOW_DELAY_MS = 180;
const TOOLTIP_HIDE_DELAY_MS = 80;
const TOOLTIP_GAP_REM = 0.375;
const VIEWPORT_MARGIN_REM = 0.5;
const FALLBACK_ROOT_FONT_PX = 16;

let nextTooltipId = 0;

function supportsHintPopover() {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("div");
  if (!("popover" in probe)) return false;
  try {
    probe.setAttribute("popover", "hint");
    return probe.popover === "hint";
  } catch {
    return false;
  }
}

function getRootFontSizePx() {
  if (typeof document === "undefined") return FALLBACK_ROOT_FONT_PX;
  const raw = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(raw) && raw > 0 ? raw : FALLBACK_ROOT_FONT_PX;
}

/**
 * Attach an accessible Top-Layer pill tooltip positioned above/below the trigger element.
 * @param {HTMLElement} trigger
 * @param {string} initialText
 * @param {{
 *   signal?: AbortSignal,
 *   placement?: "top" | "bottom" | "auto"
 * }} [options]
 */
export function attachTooltip(trigger, initialText, options = {}) {
  const safeOptions = options || {};
  if (!trigger) {
    return {
      show: () => {},
      hide: () => {},
      isOpen: () => false,
      element: null,
      setText: () => {},
      destroy: () => {},
    };
  }

  let text = String(initialText || "").trim();
  const controller = new AbortController();
  const { signal } = controller;

  const destroy = () => {
    close();
    clearTimers();
    controller.abort();
    if (trigger && typeof trigger.removeAttribute === "function") {
      trigger.removeAttribute("aria-describedby");
    }
    if (tooltip && typeof tooltip.remove === "function") {
      tooltip.remove();
    }
  };

  if (safeOptions.signal) {
    if (safeOptions.signal.aborted) {
      return {
        show: () => {},
        hide: () => {},
        isOpen: () => false,
        element: null,
        setText: () => {},
        destroy: () => {},
      };
    }
    safeOptions.signal.addEventListener("abort", () => destroy(), {
      once: true,
    });
  }

  nextTooltipId += 1;
  const tooltip = document.createElement("div");
  tooltip.id = `ui-tooltip-${nextTooltipId}`;
  tooltip.className = "ui-tooltip";
  tooltip.setAttribute("role", "tooltip");

  const usePopover = typeof tooltip.showPopover === "function";
  if (usePopover) {
    tooltip.setAttribute("popover", supportsHintPopover() ? "hint" : "manual");
  }

  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  if (text) {
    trigger.setAttribute("aria-describedby", tooltip.id);
  }

  let showTimer = null;
  let hideTimer = null;
  let isOpen = false;
  let suppressHoverOpen = false;

  const clearTimers = () => {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const syncPosition = () => {
    if (!trigger.isConnected) return;
    const rootPx = getRootFontSizePx();
    const gapPx = TOOLTIP_GAP_REM * rootPx;
    const marginPx = VIEWPORT_MARGIN_REM * rootPx;

    const triggerRect = trigger.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const halfWidth = tipRect.width / 2;

    const rawCenterX = triggerRect.left + triggerRect.width / 2;
    const minCenterX = Math.ceil(marginPx + halfWidth);
    const maxCenterX = Math.floor(window.innerWidth - marginPx - halfWidth);
    const clampedX =
      minCenterX <= maxCenterX
        ? Math.min(maxCenterX, Math.max(minCenterX, Math.round(rawCenterX)))
        : Math.round(rawCenterX);

    const fitsAbove = triggerRect.top - gapPx - tipRect.height >= marginPx;
    const placement = fitsAbove ? "top" : "bottom";
    const anchorY = fitsAbove
      ? triggerRect.top - gapPx
      : triggerRect.bottom + gapPx;

    tooltip.setAttribute("data-placement", placement);
    tooltip.style.setProperty("--tooltip-x", `${clampedX}px`);
    tooltip.style.setProperty("--tooltip-y", `${Math.round(anchorY)}px`);
  };

  const open = () => {
    if (!text || trigger.hasAttribute("disabled") || !trigger.isConnected)
      return;
    clearTimers();
    if (!isOpen) {
      if (usePopover) {
        try {
          tooltip.showPopover();
        } catch {}
      } else {
        tooltip.setAttribute("data-open", "true");
      }
      isOpen = true;
    }
    syncPosition();
  };

  const close = () => {
    clearTimers();
    if (!isOpen) return;
    if (usePopover) {
      try {
        tooltip.hidePopover();
      } catch {}
    } else {
      tooltip.removeAttribute("data-open");
    }
    isOpen = false;
  };

  const scheduleOpen = () => {
    if (suppressHoverOpen || !text || trigger.hasAttribute("disabled")) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(hover: none)").matches
    ) {
      return;
    }
    clearTimers();
    showTimer = setTimeout(() => {
      showTimer = null;
      open();
    }, TOOLTIP_SHOW_DELAY_MS);
  };

  const scheduleClose = () => {
    clearTimers();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      close();
    }, TOOLTIP_HIDE_DELAY_MS);
  };

  const handleMouseLeave = () => {
    suppressHoverOpen = false;
    scheduleClose();
  };

  const handleTriggerActivate = () => {
    suppressHoverOpen = true;
    close();
  };

  trigger.addEventListener("mouseenter", scheduleOpen, { signal });
  trigger.addEventListener("mouseleave", handleMouseLeave, { signal });
  trigger.addEventListener("pointerdown", handleTriggerActivate, { signal });
  trigger.addEventListener("touchstart", handleTriggerActivate, {
    signal,
    passive: true,
  });
  trigger.addEventListener("click", handleTriggerActivate, { signal });
  trigger.addEventListener(
    "focusin",
    () => {
      if (
        typeof trigger.matches === "function"
          ? trigger.matches(":focus-visible")
          : true
      ) {
        open();
      }
    },
    { signal },
  );
  trigger.addEventListener("focusout", close, { signal });
  window.addEventListener("scroll", close, {
    signal,
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", close, { signal });

  tooltip.addEventListener(
    "mouseenter",
    () => {
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    },
    { signal },
  );
  tooltip.addEventListener("mouseleave", scheduleClose, { signal });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && isOpen) {
        event.stopPropagation();
        close();
      }
    },
    { signal },
  );

  return {
    show: open,
    hide: close,
    isOpen: () => isOpen,
    element: tooltip,
    setText(nextText) {
      text = String(nextText || "").trim();
      tooltip.textContent = text;
      if (!text) {
        close();
        trigger.removeAttribute("aria-describedby");
      } else {
        trigger.setAttribute("aria-describedby", tooltip.id);
        if (isOpen) syncPosition();
      }
    },
    destroy,
  };
}
