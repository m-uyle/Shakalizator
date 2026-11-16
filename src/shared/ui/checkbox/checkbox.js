/**
 * Create a checkbox control with optional label and AbortController lifecycle.
 * @param {{
 *   checked?: boolean,
 *   indeterminate?: boolean,
 *   disabled?: boolean,
 *   label?: string,
 *   ariaLabel?: string,
 *   stopPropagation?: boolean,
 *   onChange?: (checked: boolean, event: Event) => void
 * }} [options]
 */
export function createCheckbox(options = {}) {
  const {
    checked = false,
    indeterminate = false,
    disabled = false,
    label = "",
    ariaLabel = "",
    stopPropagation = false,
    onChange = null,
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "ui-checkbox";
  input.checked = Boolean(checked);
  input.indeterminate = Boolean(indeterminate);
  input.disabled = Boolean(disabled);
  if (ariaLabel) {
    input.setAttribute("aria-label", ariaLabel);
  }

  let root = input;
  let textSpan = null;
  if (label) {
    const wrapper = document.createElement("label");
    wrapper.className = "ui-checkbox-label";
    textSpan = document.createElement("span");
    textSpan.className = "ui-checkbox-label__text";
    textSpan.textContent = label;
    wrapper.appendChild(input);
    wrapper.appendChild(textSpan);
    root = wrapper;
  }

  if (stopPropagation) {
    root.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
      },
      { signal },
    );
  }

  if (typeof onChange === "function") {
    input.addEventListener(
      "change",
      (event) => {
        onChange(input.checked, event);
      },
      { signal },
    );
  }

  return {
    element: root,
    input,
    setChecked(nextChecked) {
      input.checked = Boolean(nextChecked);
    },
    setIndeterminate(nextIndeterminate) {
      input.indeterminate = Boolean(nextIndeterminate);
    },
    setDisabled(nextDisabled) {
      input.disabled = Boolean(nextDisabled);
    },
    setLabel(nextLabel) {
      if (textSpan) {
        textSpan.textContent = String(nextLabel || "");
      }
    },
    setAriaLabel(nextAriaLabel) {
      if (nextAriaLabel) {
        input.setAttribute("aria-label", String(nextAriaLabel));
      } else {
        input.removeAttribute("aria-label");
      }
    },
    isChecked() {
      return input.checked;
    },
    isIndeterminate() {
      return input.indeterminate;
    },
    destroy() {
      controller.abort();
    },
  };
}
