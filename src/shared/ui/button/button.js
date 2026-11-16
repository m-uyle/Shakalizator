import { attachTooltip } from "../tooltip/tooltip.js";

const VALID_VARIANTS = new Set([
  "default",
  "ghost",
  "pill",
  "pillActive",
  "pillGhost",
]);

const VALID_SIZES = new Set(["full", "pill", "icon", "pillIcon"]);

/**
 * Create a button primitive adhering to the CAS 4-slot anatomy.
 * @param {{
 *   leading?: Node | null,
 *   label?: string | Node,
 *   trailing?: Node | null,
 *   meta?: string | Node | null,
 *   variant?: "default" | "ghost" | "pill" | "pillActive" | "pillGhost",
 *   size?: "full" | "pill" | "icon" | "pillIcon",
 *   type?: "button" | "submit" | "reset",
 *   disabled?: boolean,
 *   pressed?: boolean | null,
 *   tooltip?: string,
 *   ariaLabel?: string,
 *   className?: string,
 *   onClick?: (event: MouseEvent) => void,
 *   onHoldStart?: (event: Event) => void,
 *   onHoldEnd?: (event: Event) => void
 * }} [options]
 */
export function createButton(options = {}) {
  const {
    leading = null,
    label = "",
    trailing = null,
    meta = null,
    variant = "default",
    size = "full",
    type = "button",
    disabled = false,
    pressed = null,
    tooltip = "",
    ariaLabel = "",
    className = "",
    onClick = null,
    onHoldStart = null,
    onHoldEnd = null,
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const button = document.createElement("button");
  button.type = type;
  button.disabled = Boolean(disabled);
  if (typeof pressed === "boolean") {
    button.setAttribute("aria-pressed", String(pressed));
  }
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);

  const tooltipHandle = tooltip ? attachTooltip(button, tooltip) : null;

  let currentVariant = VALID_VARIANTS.has(variant) ? variant : "default";
  let currentSize = VALID_SIZES.has(size) ? size : "full";
  let extraClass = typeof className === "string" ? className.trim() : "";

  const syncClassName = () => {
    const parts = [
      "ui-btn",
      `ui-btn--${currentVariant}`,
      `ui-btn--${currentSize}`,
    ];
    if (extraClass) parts.push(extraClass);
    button.className = parts.join(" ");
  };

  syncClassName();

  let leadingSlot = null;
  if (leading) {
    leadingSlot = document.createElement("span");
    leadingSlot.className = "ui-btn__leading";
    leadingSlot.setAttribute("aria-hidden", "true");
    leadingSlot.appendChild(leading);
    button.appendChild(leadingSlot);
  }

  const contentSlot = document.createElement("span");
  contentSlot.className = "ui-btn__content";
  if (typeof label === "string") {
    if (label.length > 0) {
      contentSlot.textContent = label;
      button.appendChild(contentSlot);
    }
  } else if (label instanceof Node) {
    contentSlot.appendChild(label);
    button.appendChild(contentSlot);
  }

  let trailingSlot = null;
  if (trailing) {
    trailingSlot = document.createElement("span");
    trailingSlot.className = "ui-btn__trailing";
    trailingSlot.setAttribute("aria-hidden", "true");
    trailingSlot.appendChild(trailing);
    button.appendChild(trailingSlot);
  }

  let metaSlot = null;
  if (meta) {
    metaSlot = document.createElement("span");
    metaSlot.className = "ui-btn__meta";
    if (typeof meta === "string") {
      metaSlot.textContent = meta;
    } else if (meta instanceof Node) {
      metaSlot.appendChild(meta);
    }
    button.appendChild(metaSlot);
  }

  if (typeof onClick === "function") {
    button.addEventListener("click", onClick, { signal });
  }

  let isHolding = false;
  const startHold = (event) => {
    if (button.disabled) return;
    if (event.type === "mousedown" && event.button !== 0) return;
    isHolding = true;
    if (typeof onHoldStart === "function") {
      onHoldStart(event);
    }
  };
  const endHold = (event) => {
    if (!isHolding) return;
    isHolding = false;
    if (typeof onHoldEnd === "function") {
      onHoldEnd(event);
    }
  };

  if (typeof onHoldStart === "function" || typeof onHoldEnd === "function") {
    button.addEventListener("mousedown", startHold, { signal });
    button.addEventListener("touchstart", startHold, { signal, passive: false });
    window.addEventListener("mouseup", endHold, { signal, passive: true });
    window.addEventListener("touchend", endHold, { signal, passive: true });
    window.addEventListener("touchcancel", endHold, { signal, passive: true });
    window.addEventListener("blur", endHold, { signal, passive: true });
  }

  return {
    element: button,
    setLabel(nextLabel) {
      if (typeof nextLabel === "string") {
        if (nextLabel.length === 0) {
          contentSlot.textContent = "";
          contentSlot.remove();
          return;
        }
        contentSlot.textContent = nextLabel;
      } else if (nextLabel instanceof Node) {
        contentSlot.replaceChildren(nextLabel);
      } else {
        contentSlot.textContent = "";
        contentSlot.remove();
        return;
      }
      if (!contentSlot.parentNode) {
        button.insertBefore(contentSlot, trailingSlot || metaSlot);
      }
    },
    setDisabled(nextDisabled) {
      const isDisabled = Boolean(nextDisabled);
      button.disabled = isDisabled;
      if (isDisabled) {
        endHold(null);
        if (tooltipHandle) {
          tooltipHandle.hide();
        }
      }
    },
    setPressed(nextPressed) {
      if (nextPressed === null || nextPressed === undefined) {
        button.removeAttribute("aria-pressed");
      } else {
        button.setAttribute("aria-pressed", String(Boolean(nextPressed)));
      }
    },
    setVariant(nextVariant) {
      if (VALID_VARIANTS.has(nextVariant)) {
        currentVariant = nextVariant;
        syncClassName();
      }
    },
    setSize(nextSize) {
      if (VALID_SIZES.has(nextSize)) {
        currentSize = nextSize;
        syncClassName();
      }
    },
    setAriaLabel(nextAriaLabel) {
      if (nextAriaLabel) {
        button.setAttribute("aria-label", String(nextAriaLabel));
      } else {
        button.removeAttribute("aria-label");
      }
    },
    setExtraClass(nextExtraClass) {
      extraClass = typeof nextExtraClass === "string" ? nextExtraClass.trim() : "";
      syncClassName();
    },
    destroy() {
      isHolding = false;
      if (tooltipHandle) tooltipHandle.destroy();
      controller.abort();
    },
  };
}

