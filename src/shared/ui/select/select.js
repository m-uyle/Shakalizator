import { createIcon } from "../icon/icon.js";
import { attachTooltip } from "../tooltip/tooltip.js";

/**
 * Create an accessible grouped custom select primitive adhering to the CAS 4-slot model.
 * @param {{
 *   ariaLabel?: string,
 *   placeholder?: string,
 *   leading?: Node | null,
 *   leadingIcon?: string | null,
 *   trailing?: Node | null,
 *   className?: string,
 *   disabled?: boolean,
 *   tooltip?: string,
 *   id?: string,
 *   onChange?: (value: string) => void
 * }} [options]
 */
export function createSelect(options = {}) {
  const {
    ariaLabel = "Select option",
    placeholder = "Select option",
    leading = null,
    leadingIcon = null,
    trailing = null,
    className = "",
    disabled = false,
    tooltip = "",
    id = "",
    onChange = null,
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const wrapper = document.createElement("div");
  wrapper.className = className ? `ui-select ${className}` : "ui-select";
  if (id) {
    wrapper.id = id;
  }

  const panelId = id
    ? `${id}-panel`
    : `ui-select-panel-${Math.random().toString(36).slice(2, 9)}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-select-trigger";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", panelId);
  trigger.setAttribute("aria-label", ariaLabel);

  if (tooltip) {
    attachTooltip(trigger, tooltip, { signal });
  }

  // 1. Leading slot (CAS slot 1)
  let leadingEl = null;
  if (leading instanceof Node) {
    leadingEl = leading;
  } else if (typeof leadingIcon === "string" && leadingIcon) {
    leadingEl = createIcon(leadingIcon);
  }
  if (leadingEl) {
    leadingEl.classList.add("ui-select__leading");
    leadingEl.setAttribute("aria-hidden", "true");
    trigger.appendChild(leadingEl);
  }

  // 2. Content slot (CAS slot 2)
  const labelEl = document.createElement("span");
  labelEl.className = "ui-select-label";
  labelEl.textContent = placeholder;
  trigger.appendChild(labelEl);

  // 3. Trailing slot (CAS slot 3)
  const arrowEl =
    trailing instanceof Node ? trailing : createIcon("chevron-down");
  arrowEl.classList.add("ui-select__trailing");
  arrowEl.setAttribute("aria-hidden", "true");
  trigger.appendChild(arrowEl);

  // Panel / Listbox
  const panel = document.createElement("div");
  panel.id = panelId;
  panel.className = "ui-select-panel is-hidden";
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", ariaLabel);
  panel.setAttribute("tabindex", "-1");
  panel.hidden = true;

  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);

  let isDisabled = Boolean(disabled);
  let isLocked = false;
  let currentValue = "";
  let activeLabel = placeholder;
  let optionNodes = [];

  if (isDisabled) {
    trigger.disabled = true;
    trigger.setAttribute("aria-disabled", "true");
  }

  const close = () => {
    panel.hidden = true;
    panel.classList.add("is-hidden");
    trigger.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    if (isDisabled || isLocked) return;
    panel.hidden = false;
    panel.classList.remove("is-hidden");
    trigger.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  };

  const toggle = () => {
    if (isDisabled || isLocked) return;
    if (panel.classList.contains("is-hidden")) {
      open();
    } else {
      close();
    }
  };

  const syncSelectedUI = (value, fallbackLabel = placeholder) => {
    currentValue = value;
    let found = false;
    for (const optBtn of optionNodes) {
      const match =
        Boolean(value) && optBtn.getAttribute("data-value") === value;
      optBtn.classList.toggle("is-selected", match);
      optBtn.setAttribute("aria-selected", match ? "true" : "false");
      if (match) {
        const textNode = optBtn.querySelector(".ui-select-option__label");
        const resolvedText =
          (textNode ? textNode.textContent : optBtn.textContent) || placeholder;
        activeLabel = resolvedText;
        labelEl.textContent = resolvedText;
        found = true;
      }
    }
    if (!found) {
      activeLabel = fallbackLabel;
      labelEl.textContent = fallbackLabel;
    }
  };

  trigger.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      toggle();
    },
    { signal },
  );

  trigger.addEventListener(
    "keydown",
    (event) => {
      if (isDisabled || isLocked || optionNodes.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (panel.classList.contains("is-hidden")) {
          open();
        }
        const selectedIdx = optionNodes.findIndex((btn) =>
          btn.classList.contains("is-selected"),
        );
        const fallbackIdx =
          event.key === "ArrowDown" ? 0 : optionNodes.length - 1;
        const target =
          optionNodes[selectedIdx >= 0 ? selectedIdx : fallbackIdx];
        if (target) target.focus();
      }
    },
    { signal },
  );

  panel.addEventListener(
    "keydown",
    (event) => {
      if (optionNodes.length === 0) return;
      const currentIdx = optionNodes.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIdx =
          currentIdx >= 0 ? (currentIdx + 1) % optionNodes.length : 0;
        optionNodes[nextIdx].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIdx =
          currentIdx >= 0
            ? (currentIdx - 1 + optionNodes.length) % optionNodes.length
            : optionNodes.length - 1;
        optionNodes[prevIdx].focus();
      } else if (event.key === "Home" || event.key === "PageUp") {
        event.preventDefault();
        optionNodes[0].focus();
      } else if (event.key === "End" || event.key === "PageDown") {
        event.preventDefault();
        optionNodes[optionNodes.length - 1].focus();
      } else if (event.key === "Tab") {
        close();
      }
    },
    { signal },
  );

  wrapper.addEventListener(
    "focusout",
    (event) => {
      if (event.relatedTarget && !wrapper.contains(event.relatedTarget)) {
        close();
      }
    },
    { signal },
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!wrapper.contains(event.target)) {
        close();
      }
    },
    { signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !panel.classList.contains("is-hidden")) {
        event.stopPropagation();
        event.preventDefault();
        close();
        trigger.focus({ preventScroll: true });
      }
    },
    { signal },
  );

  return {
    element: wrapper,
    trigger,
    panel,
    setOptions(groups, selectedValue, fallbackLabel = placeholder) {
      panel.replaceChildren();
      optionNodes = [];
      let resolvedLabel = fallbackLabel;

      if (!Array.isArray(groups)) {
        currentValue = selectedValue || "";
        activeLabel = resolvedLabel;
        labelEl.textContent = resolvedLabel;
        return;
      }

      let optionIndex = 0;
      for (const groupOrItem of groups) {
        if (groupOrItem && Array.isArray(groupOrItem.items)) {
          const groupContainer = document.createElement("div");
          groupContainer.setAttribute("role", "group");
          if (groupOrItem.title) {
            groupContainer.setAttribute("aria-label", groupOrItem.title);
            const titleEl = document.createElement("div");
            titleEl.className = "ui-select-group-title";
            titleEl.setAttribute("aria-hidden", "true");
            titleEl.textContent = groupOrItem.title;
            groupContainer.appendChild(titleEl);
          }

          for (const item of groupOrItem.items) {
            if (!item) continue;
            const optBtn = document.createElement("button");
            optBtn.type = "button";
            optBtn.id = `${panelId}-opt-${optionIndex++}`;
            optBtn.className = "ui-select-option";
            optBtn.setAttribute("role", "option");
            optBtn.setAttribute("data-value", item.value || "");
            const isSelected =
              Boolean(selectedValue) && item.value === selectedValue;
            optBtn.classList.toggle("is-selected", isSelected);
            optBtn.setAttribute("aria-selected", isSelected ? "true" : "false");

            const optLabel = document.createElement("span");
            optLabel.className = "ui-select-option__label";
            optLabel.textContent = item.label || item.value || "";
            const checkIcon = createIcon("check", {
              className: "ui-select-check",
            });
            checkIcon.setAttribute("aria-hidden", "true");
            optBtn.appendChild(optLabel);
            optBtn.appendChild(checkIcon);

            if (isSelected) {
              resolvedLabel = item.label;
            }

            optBtn.addEventListener(
              "click",
              (event) => {
                event.stopPropagation();
                syncSelectedUI(item.value);
                close();
                trigger.focus({ preventScroll: true });
                if (typeof onChange === "function") {
                  onChange(item.value);
                }
              },
              { signal },
            );

            optionNodes.push(optBtn);
            groupContainer.appendChild(optBtn);
          }

          panel.appendChild(groupContainer);
        } else if (groupOrItem && typeof groupOrItem === "object") {
          const item = groupOrItem;
          const optBtn = document.createElement("button");
          optBtn.type = "button";
          optBtn.id = `${panelId}-opt-${optionIndex++}`;
          optBtn.className = "ui-select-option";
          optBtn.setAttribute("role", "option");
          optBtn.setAttribute("data-value", item.value);
          const isSelected =
            Boolean(selectedValue) && item.value === selectedValue;
          optBtn.classList.toggle("is-selected", isSelected);
          optBtn.setAttribute("aria-selected", isSelected ? "true" : "false");

          const optLabel = document.createElement("span");
          optLabel.className = "ui-select-option__label";
          optLabel.textContent = item.label;
          const checkIcon = createIcon("check", {
            className: "ui-select-check",
          });
          checkIcon.setAttribute("aria-hidden", "true");
          optBtn.appendChild(optLabel);
          optBtn.appendChild(checkIcon);

          if (isSelected) {
            resolvedLabel = item.label;
          }

          optBtn.addEventListener(
            "click",
            (event) => {
              event.stopPropagation();
              syncSelectedUI(item.value);
              close();
              trigger.focus({ preventScroll: true });
              if (typeof onChange === "function") {
                onChange(item.value);
              }
            },
            { signal },
          );

          optionNodes.push(optBtn);
          panel.appendChild(optBtn);
        }
      }

      currentValue = selectedValue || "";
      activeLabel = resolvedLabel;
      labelEl.textContent = resolvedLabel;
    },
    setValue(value, fallbackLabel = placeholder) {
      syncSelectedUI(value, fallbackLabel);
    },
    setDisabled(disabled, emptyText = "") {
      isDisabled = Boolean(disabled);
      trigger.disabled = isDisabled;
      trigger.setAttribute(
        "aria-disabled",
        isDisabled || isLocked ? "true" : "false",
      );
      if (isDisabled) {
        trigger.classList.remove("is-locked");
        labelEl.textContent = emptyText;
        arrowEl.classList.remove("is-hidden");
        close();
      } else {
        labelEl.textContent = activeLabel;
      }
    },
    setLocked(locked) {
      isLocked = Boolean(locked);
      trigger.classList.toggle("is-locked", !isDisabled && isLocked);
      trigger.setAttribute(
        "aria-disabled",
        isDisabled || isLocked ? "true" : "false",
      );
      arrowEl.classList.toggle("is-hidden", !isDisabled && isLocked);
      if (isLocked) {
        close();
      }
    },
    setAriaLabel(nextAriaLabel) {
      if (nextAriaLabel) {
        trigger.setAttribute("aria-label", String(nextAriaLabel));
        panel.setAttribute("aria-label", String(nextAriaLabel));
      }
    },
    getValue() {
      return currentValue;
    },
    isOpen() {
      return !panel.classList.contains("is-hidden");
    },
    open,
    close,
    destroy() {
      close();
      controller.abort();
    },
  };
}
