import {
  DEFAULT_PALETTE_COLORS,
  DEFAULT_QUALITY,
  PALETTE_STEPS,
  QUALITY_STEPS,
  getAlgorithmGroupsForKeys,
  getBatchCompatibleAlgorithms,
  getItemDegree,
  getNextStepValue,
  getStepProgressPercent,
  getStepValueByRatio,
  isLosslessAlgorithm,
  isPaletteAlgorithm,
  snapToSteps,
} from "../../../core/compression/index.js";
import { createScrubber, createSelect } from "../../../shared/ui/index.js";

/**
 * Mount the algorithm selector and quality/palette scrubber widget.
 * @param {HTMLElement} container
 * @param {{ store: ReturnType<import("../../../state/index.js").createAppStore> }} deps
 */
export function mountCompressionControls(container, { store } = {}) {
  if (!store || typeof store.subscribe !== "function") {
    throw new TypeError(
      "mountCompressionControls requires a valid store with subscribe()",
    );
  }

  const root = document.createElement("section");
  root.className = "compression-controls";
  root.setAttribute("aria-label", "Compression settings");

  // 1. Algorithm group
  const algoGroup = document.createElement("div");
  algoGroup.className = "compression-controls__group";
  const algoLabelId = "compression-algo-label";
  algoGroup.setAttribute("role", "group");
  algoGroup.setAttribute("aria-labelledby", algoLabelId);

  const algoLabelRow = document.createElement("div");
  algoLabelRow.className = "compression-controls__label";
  const algoLabel = document.createElement("span");
  algoLabel.id = algoLabelId;
  algoLabel.textContent = "Algorithm";
  const algoTargetHint = document.createElement("span");
  algoTargetHint.className = "compression-controls__target is-hidden";
  algoLabelRow.appendChild(algoLabel);
  algoLabelRow.appendChild(algoTargetHint);

  const selectControl = createSelect({
    ariaLabel: "Compression Algorithm",
    placeholder: "Select algorithm",
    onChange: (nextMethod) => {
      store.setAlgorithm(nextMethod);
    },
  });

  algoGroup.appendChild(algoLabelRow);
  algoGroup.appendChild(selectControl.element);

  // 2. Scrubber group
  const degreeGroup = document.createElement("div");
  degreeGroup.className = "compression-controls__group";
  const degreeLabelId = "compression-degree-label";
  degreeGroup.setAttribute("role", "group");
  degreeGroup.setAttribute("aria-labelledby", degreeLabelId);

  const degreeLabelRow = document.createElement("div");
  degreeLabelRow.className = "compression-controls__label";
  const degreeLabel = document.createElement("span");
  degreeLabel.id = degreeLabelId;
  degreeLabel.textContent = "Quality";
  degreeLabelRow.appendChild(degreeLabel);

  let currentMethod = "mozjpeg";
  let currentValue = DEFAULT_QUALITY;

  const scrubberControl = createScrubber({
    ariaLabel: "Quality scrubber",
    min: QUALITY_STEPS[0],
    max: QUALITY_STEPS[QUALITY_STEPS.length - 1],
    value: DEFAULT_QUALITY,
    onScrubRatio: (ratio) => {
      if (isLosslessAlgorithm(currentMethod)) return;
      const isPalette = isPaletteAlgorithm(currentMethod);
      const nextVal = getStepValueByRatio(ratio, isPalette);
      store.setDegree(nextVal);
    },
    onStepDelta: (delta) => {
      if (isLosslessAlgorithm(currentMethod)) return;
      const isPalette = isPaletteAlgorithm(currentMethod);
      const nextVal = getNextStepValue(currentValue, delta, isPalette);
      store.setDegree(nextVal);
    },
    onStepEdge: (edge) => {
      if (isLosslessAlgorithm(currentMethod)) return;
      const isPalette = isPaletteAlgorithm(currentMethod);
      const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
      const nextVal = edge === "min" ? steps[0] : steps[steps.length - 1];
      store.setDegree(nextVal);
    },
  });

  degreeGroup.appendChild(degreeLabelRow);
  degreeGroup.appendChild(scrubberControl.element);

  root.appendChild(algoGroup);
  root.appendChild(degreeGroup);
  if (container && typeof container.appendChild === "function") {
    container.appendChild(root);
  }

  let lastOptionsSig = null;

  function render(state) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const selectedItem = queue.find((item) => item.id === state?.selectedId);
    const checkedItems = queue.filter((item) => item.checked);
    const targetItems =
      checkedItems.length > 0
        ? checkedItems
        : selectedItem
          ? [selectedItem]
          : [];

    if (targetItems.length === 0) {
      currentMethod = "mozjpeg";
      currentValue = DEFAULT_QUALITY;
      algoLabel.textContent = "Algorithm";
      algoTargetHint.textContent = "";
      algoTargetHint.removeAttribute("title");
      algoTargetHint.classList.add("is-hidden");
      lastOptionsSig = "empty";
      selectControl.setDisabled(true, "—");

      degreeLabel.textContent = "Compression";
      scrubberControl.update({
        value: 0,
        min: 0,
        max: 100,
        percent: 0,
        isFull: false,
        disabled: true,
        emptyLabel: "—",
        ariaLabel: "Compression degree",
      });
      return;
    }

    const formats = targetItems.map((item) => item.format);
    const uniqueFormats = Array.from(new Set(formats)).sort();
    const compatible = getBatchCompatibleAlgorithms(uniqueFormats);
    const methods = Array.from(new Set(targetItems.map((item) => item.method)));
    const isMixedMethod = methods.length > 1;
    const primaryItem =
      selectedItem && targetItems.includes(selectedItem)
        ? selectedItem
        : targetItems[0];
    const activeMethod = isMixedMethod
      ? ""
      : compatible.includes(methods[0])
        ? methods[0]
        : compatible[0] || primaryItem.method;

    currentMethod = activeMethod || primaryItem.method;
    selectControl.setDisabled(false);

    algoLabel.textContent =
      uniqueFormats.length === 1
        ? `${uniqueFormats[0].toUpperCase()} Algorithm`
        : "Batch Algorithm";

    const showTargetMismatch =
      checkedItems.length === 1 &&
      selectedItem &&
      checkedItems[0].id !== selectedItem.id;
    if (showTargetMismatch) {
      algoTargetHint.textContent = checkedItems[0].name;
      algoTargetHint.setAttribute(
        "title",
        `Applies to checked file: ${checkedItems[0].name}`,
      );
      algoTargetHint.classList.remove("is-hidden");
    } else {
      algoTargetHint.textContent = "";
      algoTargetHint.removeAttribute("title");
      algoTargetHint.classList.add("is-hidden");
    }

    const optionsSig = uniqueFormats.join(",");
    const mixedLabel = isMixedMethod ? "Mixed" : undefined;
    if (lastOptionsSig !== optionsSig) {
      selectControl.setOptions(
        getAlgorithmGroupsForKeys(compatible),
        activeMethod,
        mixedLabel,
      );
      lastOptionsSig = optionsSig;
    } else {
      selectControl.setValue(activeMethod, mixedLabel);
    }

    selectControl.setLocked(compatible.length <= 1);

    const allLossless = targetItems.every((item) =>
      isLosslessAlgorithm(item.method),
    );
    const allPalette = targetItems.every((item) =>
      isPaletteAlgorithm(item.method),
    );
    const allQuality = targetItems.every(
      (item) =>
        !isLosslessAlgorithm(item.method) && !isPaletteAlgorithm(item.method),
    );

    if (allLossless || (!allPalette && !allQuality)) {
      degreeLabel.textContent = "Compression";
      scrubberControl.update({
        value: 0,
        min: 0,
        max: 100,
        percent: 0,
        isFull: false,
        disabled: true,
        emptyLabel: allLossless ? "Lossless" : "Mixed",
        ariaLabel: allLossless ? "Lossless compression" : "Mixed compression",
      });
      return;
    }

    const isPalette = allPalette;
    const steps = isPalette ? PALETTE_STEPS : QUALITY_STEPS;
    const rawDegree = isPalette
      ? primaryItem.paletteColors || DEFAULT_PALETTE_COLORS
      : getItemDegree(primaryItem);
    const snapped = snapToSteps(rawDegree, isPalette);
    const percent = getStepProgressPercent(snapped, isPalette);
    currentValue = snapped;

    degreeLabel.textContent = isPalette ? "Palette Colors" : "Quality";
    scrubberControl.update({
      value: snapped,
      min: steps[0],
      max: steps[steps.length - 1],
      percent,
      isFull: percent >= 99.5,
      disabled: false,
      ariaLabel: isPalette ? "Palette colors scrubber" : "Quality scrubber",
    });
  }

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return {
    element: root,
    destroy() {
      unsubscribe();
      selectControl.destroy();
      scrubberControl.destroy();
      root.remove();
    },
  };
}
