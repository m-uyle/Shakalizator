import { createButton } from "../button/button.js";

/**
 * Create a file picker trigger combining a hidden <input type="file"> and a button.
 * @param {{
 *   label?: string | Node,
 *   leading?: Node | null,
 *   trailing?: Node | null,
 *   variant?: "default" | "ghost" | "pill" | "pillActive" | "pillGhost",
 *   size?: "full" | "pill" | "icon" | "pillIcon",
 *   tooltip?: string,
 *   className?: string,
 *   disabled?: boolean,
 *   accept?: string,
 *   multiple?: boolean,
 *   onFilesSelected?: (files: FileList) => void
 * }} [options]
 */
export function createFileTrigger(options = {}) {
  const {
    label = "Load",
    leading = null,
    trailing = null,
    variant = "default",
    size = "full",
    tooltip = "",
    className = "",
    disabled = false,
    accept = "",
    multiple = false,
    onFilesSelected = null,
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const container = document.createElement("div");
  container.className = "ui-file-trigger";

  const input = document.createElement("input");
  input.type = "file";
  input.className = "is-hidden";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  if (accept) input.accept = accept;
  input.multiple = Boolean(multiple);
  input.disabled = Boolean(disabled);

  const button = createButton({
    label,
    leading,
    trailing,
    variant,
    size,
    tooltip,
    className,
    disabled: Boolean(disabled),
    onClick: () => {
      if (!input.disabled) {
        input.click();
      }
    },
  });

  input.addEventListener(
    "change",
    () => {
      const files = Array.from(input.files || []);
      input.value = "";
      const handler = onFilesSelected || options.onFiles;
      if (files.length > 0 && typeof handler === "function") {
        handler(files);
      }
    },
    { signal },
  );

  container.appendChild(input);
  container.appendChild(button.element);

  return {
    element: container,
    button,
    input,
    openPicker() {
      if (!input.disabled) {
        input.click();
      }
    },
    setDisabled(nextDisabled) {
      const isDisabled = Boolean(nextDisabled);
      input.disabled = isDisabled;
      button.setDisabled(isDisabled);
    },
    setLabel(nextLabel) {
      button.setLabel(nextLabel);
    },
    setVariant(nextVariant) {
      button.setVariant(nextVariant);
    },
    setSize(nextSize) {
      button.setSize(nextSize);
    },
    destroy() {
      controller.abort();
      button.destroy();
    },
  };
}
