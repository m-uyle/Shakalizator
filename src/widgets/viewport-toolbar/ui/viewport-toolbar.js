import { formatZoomPercent } from "../../../core/viewport/index.js";
import { createButton, createIcon } from "../../../shared/ui/index.js";

const STATUS_SHOW_DELAY_MS = 280;
const STATUS_DONE_HOLD_MS = 1300;
const STATUS_NOTICE_HOLD_MS = 2200;
const STATUS_ERROR_HOLD_MS = 6000;

function blurOnMouseClick(btnElement, signal) {
  btnElement.addEventListener(
    "click",
    (event) => {
      if (event.detail > 0) {
        btnElement.blur();
      }
    },
    { signal }
  );
}

/**
 * Mount the floating viewport toolbar (Diff, Blink, Zoom Fit) and signature.
 * @param {HTMLElement} container
 * @param {{ store: ReturnType<import("../../../state/index.js").createAppStore> }} deps
 */
export function mountViewportToolbar(container, { store } = {}) {
  if (!store || typeof store.subscribe !== "function") {
    throw new TypeError("mountViewportToolbar requires a valid store with subscribe()");
  }

  const controller = new AbortController();
  const { signal } = controller;

  const toolbar = document.createElement("div");
  toolbar.className = "viewport-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Viewport controls");

  const modesDock = document.createElement("div");
  modesDock.className = "viewport-toolbar__dock";

  const btnDiff = createButton({
    label: "Diff",
    variant: "pill",
    size: "pill",
    tooltip: "Toggle pixel diff (D)",
    disabled: true,
    pressed: false,
    onClick: () => store.toggleDiff(),
  });

  const btnBlink = createButton({
    label: "Blink",
    variant: "pill",
    size: "pill",
    tooltip: "Hold to view original (Space)",
    disabled: true,
    pressed: false,
    onHoldStart: (event) => {
      event.preventDefault();
      store.setBlinkHold(true);
    },
    onHoldEnd: () => {
      store.setBlinkHold(false);
    },
  });

  modesDock.appendChild(btnDiff.element);
  modesDock.appendChild(btnBlink.element);

  const zoomDock = document.createElement("div");
  zoomDock.className = "viewport-toolbar__dock";

  const zoomLabelPrefix = document.createElement("span");
  zoomLabelPrefix.className = "viewport-toolbar__zoom-label";
  zoomLabelPrefix.textContent = "Zoom:";

  const zoomValue = document.createElement("span");
  zoomValue.className = "viewport-toolbar__zoom-value";
  zoomValue.textContent = "100%";

  const zoomContent = document.createDocumentFragment();
  zoomContent.appendChild(zoomLabelPrefix);
  zoomContent.appendChild(zoomValue);

  const btnZoomFit = createButton({
    label: zoomContent,
    variant: "pillGhost",
    size: "pill",
    tooltip: "Fit canvas to view (F)",
    disabled: true,
    onClick: () => store.requestFit(),
  });

  zoomDock.appendChild(btnZoomFit.element);

  const leftGroup = document.createElement("div");
  leftGroup.className = "viewport-toolbar__group";
  leftGroup.appendChild(modesDock);
  leftGroup.appendChild(zoomDock);

  const demoDock = document.createElement("div");
  demoDock.className = "viewport-toolbar__dock";

  const btnDemo = createButton({
    leading: createIcon("shakal-demo"),
    variant: "pill",
    size: "pillIcon",
    ariaLabel: "Load demo samples",
    tooltip: "Load demo samples",
    onClick: () => store.loadDemoSamples(),
  });

  demoDock.appendChild(btnDemo.element);

  toolbar.appendChild(leftGroup);
  toolbar.appendChild(demoDock);

  const statusPill = document.createElement("div");
  statusPill.className = "viewport-status";
  statusPill.setAttribute("role", "status");
  statusPill.setAttribute("aria-live", "polite");

  const statusSpinner = createIcon("spinner");
  const statusCheck = createIcon("check");
  statusCheck.classList.add("is-hidden");
  const statusAlert = createIcon("alert");
  statusAlert.classList.add("is-hidden");
  const statusLabel = document.createElement("span");

  const statusClose = document.createElement("button");
  statusClose.type = "button";
  statusClose.className = "viewport-status__close is-hidden";
  statusClose.setAttribute("aria-label", "Dismiss notification");
  statusClose.appendChild(createIcon("close"));

  const dismissToast = (event) => {
    if (event) event.stopPropagation();
    clearStatusTimers();
    activeNoticeUntil = 0;
    statusPill.classList.remove("is-visible", "is-error");
    syncStatusPill(store.getState());
  };

  statusClose.addEventListener("click", dismissToast, { signal });
  statusPill.addEventListener(
    "click",
    (event) => {
      if (statusPill.classList.contains("is-error")) {
        dismissToast(event);
      }
    },
    { signal },
  );

  statusPill.appendChild(statusSpinner);
  statusPill.appendChild(statusCheck);
  statusPill.appendChild(statusAlert);
  statusPill.appendChild(statusLabel);
  statusPill.appendChild(statusClose);

  const signature = document.createElement("div");
  signature.className = "viewport-signature";
  signature.setAttribute("aria-hidden", "true");
  signature.textContent = "by uyle";

  if (container && typeof container.appendChild === "function") {
    container.appendChild(toolbar);
    container.appendChild(statusPill);
    container.appendChild(signature);
  }

  let showStatusTimer = null;
  let hideStatusTimer = null;
  let wasStatusVisible = false;
  let wasHoldingOriginal = false;
  let prevBusyCount = 0;
  let lastNoticeSeq = 0;
  let activeNoticeUntil = 0;

  function clearStatusTimers() {
    if (showStatusTimer !== null) {
      clearTimeout(showStatusTimer);
      showStatusTimer = null;
    }
    if (hideStatusTimer !== null) {
      clearTimeout(hideStatusTimer);
      hideStatusTimer = null;
    }
  }

  function renderNotice(notice, remainingMs) {
    clearStatusTimers();
    wasStatusVisible = false;
    statusSpinner.classList.add("is-hidden");
    const isError = notice.tone === "error";
    statusCheck.classList.toggle("is-hidden", isError);
    statusAlert.classList.toggle("is-hidden", !isError);
    statusClose.classList.toggle("is-hidden", !isError);
    statusPill.classList.toggle("is-error", isError);
    statusPill.setAttribute("role", isError ? "alert" : "status");
    statusLabel.textContent = notice.text;
    statusPill.classList.add("is-visible");

    hideStatusTimer = setTimeout(() => {
      hideStatusTimer = null;
      activeNoticeUntil = 0;
      statusPill.classList.remove("is-visible", "is-error");
      statusAlert.classList.add("is-hidden");
      statusClose.classList.add("is-hidden");
      syncStatusPill(store.getState());
    }, Math.max(0, remainingMs));
  }

  function syncStatusPill(state = {}) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const selectedItem = queue.find((item) => item.id === state?.selectedId);
    const hasImage = Boolean(selectedItem);
    const busyCount = queue.filter(
      (item) => item.status === "pending" || item.status === "processing",
    ).length;

    if (state.notice && state.notice.seq !== lastNoticeSeq) {
      lastNoticeSeq = state.notice.seq;
      const holdMs =
        state.notice.tone === "error"
          ? STATUS_ERROR_HOLD_MS
          : STATUS_NOTICE_HOLD_MS;
      activeNoticeUntil = Date.now() + holdMs;
      if (!state.isHoldingBlink || !hasImage) {
        renderNotice(state.notice, holdMs);
        prevBusyCount = busyCount;
        return;
      }
    }

    if (state.isHoldingBlink && hasImage) {
      clearStatusTimers();
      wasHoldingOriginal = true;
      statusSpinner.classList.add("is-hidden");
      statusCheck.classList.add("is-hidden");
      statusLabel.textContent = "Original";
      statusPill.classList.add("is-visible");
      prevBusyCount = busyCount;
      return;
    }

    if (wasHoldingOriginal) {
      wasHoldingOriginal = false;
      const remainingNoticeMs = activeNoticeUntil - Date.now();
      if (remainingNoticeMs > 0 && state.notice) {
        renderNotice(state.notice, remainingNoticeMs);
        prevBusyCount = busyCount;
        return;
      }
      activeNoticeUntil = 0;
      if (busyCount === 0) {
        wasStatusVisible = false;
        statusPill.classList.remove("is-visible");
      }
    }

    if (Date.now() < activeNoticeUntil) {
      prevBusyCount = busyCount;
      return;
    }
    activeNoticeUntil = 0;

    if (state.queue.length === 0) {
      clearStatusTimers();
      wasStatusVisible = false;
      prevBusyCount = 0;
      statusPill.classList.remove("is-visible");
      return;
    }

    if (busyCount > 0) {
      if (hideStatusTimer !== null) {
        clearTimeout(hideStatusTimer);
        hideStatusTimer = null;
      }
      statusSpinner.classList.remove("is-hidden");
      statusCheck.classList.add("is-hidden");
      statusLabel.textContent =
        busyCount > 1 ? `Compressing ${busyCount}...` : "Compressing...";

      if (wasStatusVisible) {
        statusPill.classList.add("is-visible");
      } else if (showStatusTimer === null) {
        showStatusTimer = setTimeout(() => {
          showStatusTimer = null;
          wasStatusVisible = true;
          statusPill.classList.add("is-visible");
        }, STATUS_SHOW_DELAY_MS);
      }
    } else {
      if (showStatusTimer !== null) {
        clearTimeout(showStatusTimer);
        showStatusTimer = null;
      }
      const hasError = state.queue.some((item) => item.status === "error");
      if (prevBusyCount > 0 && (wasStatusVisible || hasError)) {
        wasStatusVisible = false;
        if (hideStatusTimer !== null) {
          clearTimeout(hideStatusTimer);
        }
        statusSpinner.classList.add("is-hidden");
        statusCheck.classList.toggle("is-hidden", hasError);
        statusLabel.textContent = hasError ? "Compression failed" : "Compressed";
        statusPill.classList.add("is-visible");

        hideStatusTimer = setTimeout(() => {
          hideStatusTimer = null;
          statusPill.classList.remove("is-visible");
        }, hasError ? STATUS_NOTICE_HOLD_MS : STATUS_DONE_HOLD_MS);
      } else if (hideStatusTimer === null) {
        wasStatusVisible = false;
        statusPill.classList.remove("is-visible");
      }
    }

    prevBusyCount = busyCount;
  }

  blurOnMouseClick(btnDiff.element, signal);
  blurOnMouseClick(btnBlink.element, signal);
  blurOnMouseClick(btnZoomFit.element, signal);
  blurOnMouseClick(btnDemo.element, signal);

  statusPill.addEventListener(
    "transitionend",
    () => {
      if (!statusPill.classList.contains("is-visible")) {
        statusLabel.textContent = "";
      }
    },
    { signal }
  );

  btnBlink.element.addEventListener(
    "keydown",
    (event) => {
      if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
        event.preventDefault();
        store.setBlinkHold(true);
      }
    },
    { signal }
  );

  btnBlink.element.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        store.setBlinkHold(false);
      }
    },
    { signal }
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target;
      const targetTag = target && target.tagName;
      const targetRole = target && target.getAttribute ? target.getAttribute("role") : null;
      if (
        targetTag === "INPUT" ||
        targetTag === "TEXTAREA" ||
        targetTag === "SELECT" ||
        (target && target.isContentEditable) ||
        targetRole === "slider" ||
        targetRole === "option" ||
        document.querySelector(".ui-select-panel:not(.is-hidden)")
      ) {
        return;
      }
      const state = store.getState();
      if (!state.selectedId) return;

      if (event.code === "Space") {
        if (targetTag === "BUTTON") return;
        event.preventDefault();
        store.setBlinkHold(true);
      } else if (event.code === "KeyD") {
        event.preventDefault();
        store.toggleDiff();
      } else if (event.code === "Digit0" || event.code === "KeyF") {
        event.preventDefault();
        store.requestFit();
      } else if (event.code === "Digit1") {
        event.preventDefault();
        store.requestZoomOneToOne();
      }
    },
    { signal }
  );

  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code !== "Space") return;
      const state = store.getState();
      if (!state.isHoldingBlink) return;
      event.preventDefault();
      store.setBlinkHold(false);
    },
    { signal }
  );

  window.addEventListener(
    "blur",
    () => {
      if (store.getState().isHoldingBlink) {
        store.setBlinkHold(false);
      }
    },
    { signal }
  );

  function render(state = {}) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const selectedItem = queue.find((item) => item.id === state?.selectedId);
    const hasImage = Boolean(selectedItem);
    const hasError = Boolean(selectedItem && selectedItem.status === "error");
    const hasCompressed = Boolean(selectedItem && (selectedItem.compImageData || selectedItem.compUrl));
    const hasDemoItems = queue.some((item) => item.isDemo);
    const canDiff = Boolean(hasImage && !hasError && hasCompressed);
    const isDiffOn = Boolean(state.isDiffActive && canDiff);

    btnDiff.setDisabled(!canDiff);
    btnBlink.setDisabled(!canDiff);
    btnZoomFit.setDisabled(!hasImage || hasError);
    btnDemo.setDisabled(Boolean(state.isLoadingDemo));

    btnDiff.setVariant(isDiffOn && !state.isHoldingBlink ? "pillActive" : "pill");
    btnDiff.setPressed(isDiffOn);
    btnBlink.setVariant(state.isHoldingBlink && canDiff ? "pillActive" : "pill");
    btnBlink.setPressed(Boolean(state.isHoldingBlink && canDiff));
    btnDemo.setVariant(hasDemoItems ? "pillActive" : "pill");
    zoomValue.textContent = hasImage && !hasError ? formatZoomPercent(state.zoom) : "100%";
    syncStatusPill(state);
  }

  const unsubscribe = store.subscribe(render);
  render(store.getState());

  return {
    element: toolbar,
    statusElement: statusPill,
    signatureElement: signature,
    destroy() {
      unsubscribe();
      clearStatusTimers();
      controller.abort();
      btnDiff.destroy();
      btnBlink.destroy();
      btnZoomFit.destroy();
      btnDemo.destroy();
      toolbar.remove();
      statusPill.remove();
      signature.remove();
    },
  };
}

