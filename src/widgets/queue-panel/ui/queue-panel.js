import {
  calculateSavingsPercent,
  formatBytes,
  getAlgorithmBadge,
  getOutputFileName,
  resolveUniqueBatchFileNames,
} from "../../../core/compression/index.js";
import {
  createZipBlob,
  downloadBlob,
} from "../../../shared/platform/file-io.js";
import {
  createButton,
  createCheckbox,
  createFileTrigger,
  createIcon,
} from "../../../shared/ui/index.js";

/**
 * Mount the queue list, batch selection header, import trigger, and export footer.
 * @param {HTMLElement} container
 * @param {{ store: ReturnType<import("../../../state/index.js").createAppStore> }} deps
 */
export function mountQueuePanel(container, { store } = {}) {
  if (!store || typeof store.subscribe !== "function") {
    throw new TypeError(
      "mountQueuePanel requires a valid store with subscribe()",
    );
  }

  const controller = new AbortController();
  const { signal } = controller;

  const panel = document.createElement("section");
  panel.className = "queue-panel";
  panel.setAttribute("aria-label", "File queue panel");

  // 1. Load trigger
  const loadWrap = document.createElement("div");
  loadWrap.className = "queue-panel__load";

  const fileTrigger = createFileTrigger({
    label: "Load",
    accept: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
    multiple: true,
    onFilesSelected: (files) => {
      store.addFiles(files);
    },
  });
  loadWrap.appendChild(fileTrigger.element);

  // 2. Batch selection header
  const batchBar = document.createElement("div");
  batchBar.className = "queue-panel__batch-bar is-hidden";

  const selectAllCheckbox = createCheckbox({
    label: "Select all",
    ariaLabel: "Select all files",
    onChange: (checked) => {
      store.toggleSelectAll(checked);
    },
  });

  const batchActions = document.createElement("div");
  batchActions.className = "queue-panel__batch-actions";

  const selectedCountDisplay = document.createElement("span");
  selectedCountDisplay.className = "queue-panel__counter";
  selectedCountDisplay.setAttribute("aria-live", "polite");
  selectedCountDisplay.textContent = "0 selected";

  const btnRemoveSelected = createButton({
    leading: createIcon("trash"),
    variant: "ghost",
    size: "icon",
    ariaLabel: "Remove selected",
    tooltip: "Remove selected (Del)",
    className: "queue-panel__remove-selected",
    disabled: true,
    onClick: () => {
      const checkedIds = store
        .getState()
        .queue.filter((item) => item.checked)
        .map((item) => item.id);
      store.removeItems(checkedIds);
    },
  });

  batchActions.appendChild(btnRemoveSelected.element);
  batchActions.appendChild(selectedCountDisplay);

  batchBar.appendChild(selectAllCheckbox.element);
  batchBar.appendChild(batchActions);

  // 3. Queue list
  const queueList = document.createElement("div");
  queueList.className = "queue-panel__list";
  queueList.setAttribute("role", "list");
  queueList.setAttribute("aria-label", "Files queue");

  const emptyMsg = document.createElement("div");
  emptyMsg.className = "queue-panel__empty";
  emptyMsg.setAttribute("role", "status");
  emptyMsg.textContent = "No files";
  queueList.appendChild(emptyMsg);

  // 4. Footer divider + unified Download / ZIP button
  const footerDivider = document.createElement("div");
  footerDivider.className = "app-divider";

  const footerWrap = document.createElement("div");
  footerWrap.className = "queue-panel__footer";

  const btnDownload = createButton({
    label: "Download",
    variant: "default",
    size: "full",
    disabled: true,
    onClick: async () => {
      const state = store.getState();
      const checkedItems = state.queue.filter((item) => item.checked);

      if (checkedItems.length > 1) {
        const hasBusyChecked = checkedItems.some(
          (item) => item.status === "pending" || item.status === "processing",
        );
        const readyItems = checkedItems.filter(
          (item) => item.compBlob && item.status === "done",
        );
        if (readyItems.length === 0 || hasBusyChecked) return;

        store.setExportingZip(true);
        try {
          const entries = resolveUniqueBatchFileNames(readyItems).map(
            ({ item, filename }) => ({
              filename,
              blob: item.compBlob,
            }),
          );
          const zipBlob = await createZipBlob(entries);
          downloadBlob(zipBlob, "shakalizator.zip");
        } catch (err) {
          console.error("ZIP export failed:", err);
          store.showNotice("ZIP export failed", "error");
        } finally {
          store.setExportingZip(false);
        }
        return;
      }

      const targetItem =
        checkedItems.length === 1
          ? checkedItems[0]
          : state.queue.find((item) => item.id === state.selectedId);
      if (!targetItem || !targetItem.compBlob || targetItem.status !== "done")
        return;
      const filename = getOutputFileName(
        targetItem.name,
        targetItem.format,
        targetItem.method,
      );
      downloadBlob(targetItem.compBlob, filename);
    },
  });

  footerWrap.appendChild(btnDownload.element);

  panel.appendChild(loadWrap);
  panel.appendChild(batchBar);
  panel.appendChild(queueList);
  panel.appendChild(footerDivider);
  panel.appendChild(footerWrap);
  if (container && typeof container.appendChild === "function") {
    container.appendChild(panel);
  }

  let rowCleanupFns = [];
  let pendingDeleteFocus = null;

  function cleanupRows() {
    for (const cleanup of rowCleanupFns) {
      cleanup();
    }
    rowCleanupFns = [];
  }

  function buildQueueRow(item, isActive, showCheckbox) {
    const rowController = new AbortController();
    const rowSignal = rowController.signal;

    const row = document.createElement("div");
    const rowClasses = ["queue-row"];
    if (isActive) rowClasses.push("is-active");
    if (!showCheckbox) rowClasses.push("queue-row--single");
    row.className = rowClasses.join(" ");
    row.setAttribute("role", "listitem");
    if (isActive) {
      row.setAttribute("aria-current", "true");
    }

    const mainWrap = document.createElement("div");
    mainWrap.className = "queue-row__main";

    let rowCheckbox = null;
    if (showCheckbox) {
      rowCheckbox = createCheckbox({
        checked: Boolean(item.checked),
        ariaLabel: `Select ${item.name}`,
        stopPropagation: true,
        onChange: (checked) => {
          store.toggleItemCheck(item.id, checked);
        },
      });
      mainWrap.appendChild(rowCheckbox.element);
    }

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "queue-row__thumb";
    const appendThumbErrorIcon = () => {
      const errIconWrap = document.createElement("span");
      errIconWrap.className = "queue-row__thumb-error";
      errIconWrap.setAttribute("aria-hidden", "true");
      errIconWrap.appendChild(createIcon("alert"));
      thumbWrap.replaceChildren(errIconWrap);
    };
    if (item.status === "error") {
      appendThumbErrorIcon();
    } else {
      const thumbImg = document.createElement("img");
      thumbImg.className = "queue-row__thumb-img";
      thumbImg.src = item.origUrl;
      thumbImg.alt = "";
      thumbImg.addEventListener("error", appendThumbErrorIcon, {
        signal: rowSignal,
      });
      thumbWrap.appendChild(thumbImg);
    }
    mainWrap.appendChild(thumbWrap);

    const metaCol = document.createElement("div");
    metaCol.className = "queue-row__meta";

    const titleEl = document.createElement("div");
    titleEl.className = "queue-row__title";
    titleEl.textContent = item.name;
    titleEl.title = item.name;

    const metricsRow = document.createElement("div");
    metricsRow.className = "queue-row__metrics";

    const origSpan = document.createElement("span");
    origSpan.textContent = formatBytes(item.origSize);

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "queue-row__arrow";
    arrowSpan.setAttribute("aria-hidden", "true");
    arrowSpan.appendChild(createIcon("arrow-right"));

    const compSpan = document.createElement("span");
    const isBusy = item.status === "pending" || item.status === "processing";
    if (isBusy) {
      compSpan.className = "queue-row__spinner";
      compSpan.setAttribute("aria-label", "Compressing");
      compSpan.appendChild(createIcon("spinner"));
    } else if (item.status === "error") {
      compSpan.className = "queue-row__savings--larger";
      compSpan.textContent = "Error";
    } else {
      compSpan.textContent =
        item.compSize !== null ? formatBytes(item.compSize) : "—";
    }

    metricsRow.appendChild(origSpan);
    metricsRow.appendChild(arrowSpan);
    metricsRow.appendChild(compSpan);

    if (
      !isBusy &&
      item.status !== "error" &&
      item.origSize &&
      item.compSize !== null
    ) {
      const savings = calculateSavingsPercent(item.origSize, item.compSize);
      if (savings !== null) {
        const savingsSpan = document.createElement("span");
        savingsSpan.className =
          savings < 0
            ? "queue-row__savings queue-row__savings--larger"
            : "queue-row__savings";
        const prefix = savings > 0 ? "−" : savings < 0 ? "+" : "";
        savingsSpan.textContent = `(${prefix}${Math.abs(savings)}%)`;
        metricsRow.appendChild(savingsSpan);
      }
    }

    const methodBadge = document.createElement("div");
    methodBadge.className = "queue-row__method";
    methodBadge.textContent = getAlgorithmBadge(item);

    metaCol.appendChild(titleEl);
    metaCol.appendChild(methodBadge);
    metaCol.appendChild(metricsRow);
    mainWrap.appendChild(metaCol);

    const deleteBtn = createButton({
      leading: createIcon("close"),
      variant: "ghost",
      size: "icon",
      ariaLabel: `Remove ${item.name}`,
      className: "queue-row__delete",
      onClick: (event) => {
        event.stopPropagation();
        if (event.detail === 0) {
          const queueBefore = store.getState().queue;
          const index = queueBefore.findIndex((entry) => entry.id === item.id);
          pendingDeleteFocus = { index: index >= 0 ? index : 0 };
        }
        store.removeItem(item.id);
      },
    });

    row.appendChild(mainWrap);
    row.appendChild(deleteBtn.element);

    row.addEventListener(
      "click",
      () => {
        store.selectItem(item.id);
      },
      { signal: rowSignal },
    );

    rowCleanupFns.push(() => {
      rowController.abort();
      if (rowCheckbox) rowCheckbox.destroy();
      deleteBtn.destroy();
    });

    return row;
  }

  let lastQueueSignature = "";
  let lastSelectedIdForScroll = null;

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown" &&
        event.key !== "Delete"
      )
        return;

      const target = event.target;
      const tag = target && target.tagName;
      const role =
        target && target.getAttribute ? target.getAttribute("role") : null;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target && target.isContentEditable) ||
        role === "slider" ||
        role === "option" ||
        document.querySelector(".ui-select-panel:not(.is-hidden)")
      ) {
        return;
      }

      const state = store.getState();
      const queue = Array.isArray(state?.queue) ? state.queue : [];
      if (queue.length === 0) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        store.selectAdjacentItem(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        store.selectAdjacentItem(1);
      } else if (event.key === "Delete") {
        event.preventDefault();
        const checkedIds = queue
          .filter((item) => item.checked)
          .map((item) => item.id);
        if (checkedIds.length > 0) {
          store.removeItems(checkedIds);
        } else if (state?.selectedId) {
          store.removeItem(state.selectedId);
        }
      }
    },
    { signal },
  );

  function render(state = {}) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const hasMultiple = queue.length > 1;
    batchBar.classList.toggle("is-hidden", !hasMultiple);

    const checkedItems = queue.filter((item) => item.checked);
    const hasChecked = checkedItems.length > 0;
    const isAllChecked =
      queue.length > 0 && checkedItems.length === queue.length;
    selectedCountDisplay.textContent = `${checkedItems.length} selected`;
    btnRemoveSelected.element.classList.toggle("is-visible", hasChecked);
    btnRemoveSelected.setDisabled(!hasChecked);
    selectAllCheckbox.setChecked(isAllChecked);
    selectAllCheckbox.setIndeterminate(hasChecked && !isAllChecked);

    if (state.isExportingZip) {
      btnDownload.setLabel("...");
      btnDownload.setDisabled(true);
    } else if (checkedItems.length > 1) {
      const hasBusyChecked = checkedItems.some(
        (item) => item.status === "pending" || item.status === "processing",
      );
      const readyCount = checkedItems.filter(
        (item) => item.compBlob && item.status === "done",
      ).length;
      btnDownload.setLabel("Download ZIP");
      btnDownload.setDisabled(readyCount === 0 || hasBusyChecked);
    } else {
      const target =
        checkedItems.length === 1
          ? checkedItems[0]
          : queue.find((item) => item.id === state.selectedId);
      btnDownload.setLabel("Download");
      btnDownload.setDisabled(
        !target || !target.compBlob || target.status !== "done",
      );
    }

    const nextSignature = JSON.stringify({
      selectedId: state?.selectedId ?? null,
      items: queue.map((item) => [
        item.id,
        item.status,
        item.compSize,
        item.checked,
        item.method,
        item.quality,
        item.paletteColors,
      ]),
    });

    if (nextSignature !== lastQueueSignature) {
      lastQueueSignature = nextSignature;
      cleanupRows();

      if (queue.length === 0) {
        queueList.replaceChildren(emptyMsg);
      } else {
        const frag = document.createDocumentFragment();
        const showCheckbox = queue.length > 1;
        let activeRowEl = null;
        for (const item of queue) {
          const isActive = item.id === state.selectedId;
          const rowEl = buildQueueRow(item, isActive, showCheckbox);
          if (isActive) activeRowEl = rowEl;
          frag.appendChild(rowEl);
        }
        queueList.replaceChildren(frag);
        if (activeRowEl && state.selectedId !== lastSelectedIdForScroll) {
          activeRowEl.scrollIntoView({ block: "nearest" });
        }
      }
      if (pendingDeleteFocus) {
        const focusReq = pendingDeleteFocus;
        pendingDeleteFocus = null;
        if (queue.length === 0) {
          const loadButton = loadWrap.querySelector("button");
          if (loadButton) loadButton.focus();
        } else {
          const deleteButtons =
            queueList.querySelectorAll(".queue-row__delete");
          const targetButton =
            deleteButtons[Math.min(focusReq.index, deleteButtons.length - 1)];
          if (targetButton) targetButton.focus();
        }
      }
      lastSelectedIdForScroll = state?.selectedId ?? null;
    }
  }

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return {
    element: panel,
    openFilePicker() {
      fileTrigger.openPicker();
    },
    destroy() {
      unsubscribe();
      cleanupRows();
      controller.abort();
      fileTrigger.destroy();
      selectAllCheckbox.destroy();
      btnRemoveSelected.destroy();
      btnDownload.destroy();
      panel.remove();
    },
  };
}
