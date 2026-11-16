import {
  clampPanToViewport,
  computeExactZoomTransform,
  computeFitTransform,
  computePinchZoomTransform,
  computeWheelZoomTransform,
} from "../../../core/viewport/index.js";
import {
  imageDataToDrawable,
  loadImage,
} from "../../../shared/platform/file-io.js";
import { createButton, createIcon } from "../../../shared/ui/index.js";
import { buildDiffCanvas, drawViewportCanvas } from "./canvas-renderer.js";

/**
 * Mount the fullscreen image comparison canvas widget.
 * @param {HTMLElement} container
 * @param {{
 *   store: ReturnType<import("../../../state/index.js").createAppStore>,
 *   getSidebarOffset?: (viewportRect: DOMRect) => number,
 *   onRequestUpload?: () => void
 * }} deps
 */
export function mountViewportCanvas(
  container,
  { store, getSidebarOffset, onRequestUpload } = {},
) {
  if (!store || typeof store.subscribe !== "function") {
    throw new TypeError(
      "mountViewportCanvas requires a valid store with subscribe()",
    );
  }

  const controller = new AbortController();
  const { signal } = controller;

  const viewport = document.createElement("main");
  viewport.className = "viewport-canvas";
  viewport.setAttribute("aria-label", "Image comparison canvas");

  const canvas = document.createElement("canvas");
  canvas.className = "viewport-canvas__surface";
  canvas.setAttribute("data-canvas", "true");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Image preview");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const emptyPromptBtn = createButton({
    label: "Drop PNG, JPEG, WebP here or click to load",
    variant: "ghost",
    className: "viewport-empty-prompt",
    onClick: () => {
      if (typeof onRequestUpload === "function") {
        onRequestUpload();
      }
    },
  });
  const emptyPrompt = emptyPromptBtn.element;

  const errorPrompt = document.createElement("div");
  errorPrompt.className = "viewport-error-prompt is-hidden";
  errorPrompt.setAttribute("aria-hidden", "true");
  const errorIcon = createIcon("alert");
  const errorTitle = document.createElement("div");
  errorTitle.className = "viewport-error-prompt__title";
  errorTitle.textContent = "Unable to decode image";
  const errorDetail = document.createElement("div");
  errorDetail.className = "viewport-error-prompt__detail";
  errorPrompt.appendChild(errorIcon);
  errorPrompt.appendChild(errorTitle);
  errorPrompt.appendChild(errorDetail);

  const dropOverlay = document.createElement("div");
  dropOverlay.className = "viewport-drop-overlay";
  dropOverlay.setAttribute("aria-hidden", "true");
  dropOverlay.textContent = "Drop to load";

  viewport.appendChild(canvas);
  viewport.appendChild(emptyPrompt);
  viewport.appendChild(errorPrompt);
  viewport.appendChild(dropOverlay);
  if (container && typeof container.appendChild === "function") {
    container.appendChild(viewport);
  }

  const itemVisualCache = new Map();
  let activeOrigImg = null;
  let activeCompImg = null;
  let activeDiffCanvas = null;
  let lastRenderKey = "";
  let syncSeq = 0;
  let lastFitRequestSeq = 0;
  let lastZoom100RequestSeq = 0;
  let lastRenderedItemId = null;
  let lastRenderedDims = null;
  let pendingAutoFitId = null;
  let isFitMode = true;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let rafDrawId = null;
  let lastViewportSize = null;

  function syncCanvasSizeFromRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const nextW = Math.round(rect.width * dpr);
    const nextH = Math.round(rect.height * dpr);
    if (canvas.width === nextW && canvas.height === nextH) return false;
    canvas.width = nextW;
    canvas.height = nextH;
    canvas.style.setProperty("width", `${Math.round(rect.width)}px`);
    canvas.style.setProperty("height", `${Math.round(rect.height)}px`);
    return true;
  }

  function drawCanvas() {
    if (canvas.width === 0 || canvas.height === 0) {
      syncCanvasSizeFromRect(viewport.getBoundingClientRect());
    }
    const state = store.getState();
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const selectedItem = queue.find((entry) => entry.id === state?.selectedId);
    if (selectedItem && activeOrigImg) {
      const mode = state.isHoldingBlink
        ? "Original image preview"
        : state.isDiffActive
          ? "Difference map preview"
          : `${selectedItem.method || "Compressed"} preview`;
      canvas.setAttribute(
        "aria-label",
        `${selectedItem.name} — ${mode} (${Math.round(state.zoom * 100)}% zoom)`,
      );
    } else {
      canvas.setAttribute("aria-label", "Image preview");
    }
    drawViewportCanvas({
      canvas,
      ctx,
      state,
      origImg: activeOrigImg,
      compImg: activeCompImg,
      diffCanvas: activeDiffCanvas,
      hasAlpha: Boolean(selectedItem && selectedItem.hasAlpha),
    });
  }

  function scheduleDraw() {
    if (rafDrawId !== null) return;
    rafDrawId = requestAnimationFrame(() => {
      rafDrawId = null;
      drawCanvas();
    });
  }

  function syncErrorOverlay(selectedItem) {
    const showError = Boolean(
      selectedItem && selectedItem.status === "error" && !activeOrigImg,
    );
    errorPrompt.classList.toggle("is-hidden", !showError);
    if (showError) {
      errorPrompt.setAttribute("role", "alert");
      errorPrompt.removeAttribute("aria-hidden");
      errorTitle.textContent = `Cannot preview ${selectedItem.name}`;
      errorDetail.textContent =
        selectedItem.errorMessage || "File appears corrupted or unsupported";
    } else {
      errorPrompt.removeAttribute("role");
      errorPrompt.setAttribute("aria-hidden", "true");
    }
    viewport.classList.toggle(
      "has-image",
      Boolean(selectedItem && activeOrigImg),
    );
  }

  function resizeCanvas() {
    const rect = viewport.getBoundingClientRect();
    syncCanvasSizeFromRect(rect);

    if (rect && rect.width > 0 && rect.height > 0) {
      const state = store.getState();
      const queue = Array.isArray(state?.queue) ? state.queue : [];
      const selectedItem = queue.find(
        (entry) => entry.id === state?.selectedId,
      );
      if (isFitMode && selectedItem && activeOrigImg) {
        fitActiveImageToViewport(selectedItem);
      } else if (lastViewportSize && activeOrigImg) {
        const dx = (rect.width - lastViewportSize.w) / 2;
        const dy = (rect.height - lastViewportSize.h) / 2;
        if (dx !== 0 || dy !== 0) {
          const imgW =
            (selectedItem && selectedItem.origWidth) ||
            activeOrigImg.naturalWidth;
          const imgH =
            (selectedItem && selectedItem.origHeight) ||
            activeOrigImg.naturalHeight;
          const clamped = clampPanToViewport({
            panX: state.panX + dx,
            panY: state.panY + dy,
            imgW,
            imgH,
            zoom: state.zoom,
            viewportW: rect.width,
            viewportH: rect.height,
          });
          if (clamped.panX !== state.panX || clamped.panY !== state.panY) {
            store.setPan(clamped.panX, clamped.panY);
          }
        }
      }
      lastViewportSize = { w: rect.width, h: rect.height };
    }

    drawCanvas();
  }

  function fitActiveImageToViewport(item) {
    const imgW =
      item.origWidth || (activeOrigImg ? activeOrigImg.naturalWidth : 0);
    const imgH =
      item.origHeight || (activeOrigImg ? activeOrigImg.naturalHeight : 0);
    if (!imgW || !imgH) return;

    const rect = viewport.getBoundingClientRect();
    const sidebarOffset =
      typeof getSidebarOffset === "function" ? getSidebarOffset(rect) : 0;

    const nextTransform = computeFitTransform({
      imgW,
      imgH,
      viewportW: rect.width,
      viewportH: rect.height,
      sidebarOffset,
    });

    if (nextTransform) {
      isFitMode = true;
      store.setViewportTransform(nextTransform);
    }
  }

  function zoomActiveImageToOneToOne() {
    const state = store.getState();
    const rect = viewport.getBoundingClientRect();
    const imgW =
      (state.queue.find((entry) => entry.id === state.selectedId) || {})
        .origWidth || (activeOrigImg ? activeOrigImg.naturalWidth : 0);
    const imgH =
      (state.queue.find((entry) => entry.id === state.selectedId) || {})
        .origHeight || (activeOrigImg ? activeOrigImg.naturalHeight : 0);
    if (!imgW || !imgH) return;

    isFitMode = false;
    const next = computeExactZoomTransform({
      currentZoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      cursorX: Math.round(rect.width / 2),
      cursorY: Math.round(rect.height / 2),
      targetScale: 1.0,
    });
    const clamped = clampPanToViewport({
      panX: next.panX,
      panY: next.panY,
      imgW,
      imgH,
      zoom: next.zoom,
      viewportW: rect.width,
      viewportH: rect.height,
    });
    store.setViewportTransform({
      ...next,
      panX: clamped.panX,
      panY: clamped.panY,
    });
  }

  function syncViewportForSelection(item, state) {
    if (!item) {
      lastRenderedItemId = null;
      lastRenderedDims = null;
      pendingAutoFitId = null;
      return false;
    }

    const imgW =
      item.origWidth || (activeOrigImg ? activeOrigImg.naturalWidth : 0);
    const imgH =
      item.origHeight || (activeOrigImg ? activeOrigImg.naturalHeight : 0);
    const isNewSelection = item.id !== lastRenderedItemId;
    const isResolvedPending =
      pendingAutoFitId === item.id && imgW > 0 && imgH > 0;

    if (!isNewSelection && !isResolvedPending) {
      return false;
    }

    if (isNewSelection) {
      lastRenderedItemId = item.id;
    }

    if (!imgW || !imgH) {
      pendingAutoFitId = item.id;
      return false;
    }

    pendingAutoFitId = null;
    const dimsChanged =
      !lastRenderedDims ||
      lastRenderedDims.w !== imgW ||
      lastRenderedDims.h !== imgH;
    lastRenderedDims = { w: imgW, h: imgH };

    if (dimsChanged) {
      fitActiveImageToViewport(item);
      return true;
    }

    const rect = viewport.getBoundingClientRect();
    const clamped = clampPanToViewport({
      panX: state.panX,
      panY: state.panY,
      imgW,
      imgH,
      zoom: state.zoom,
      viewportW: rect.width,
      viewportH: rect.height,
    });
    if (clamped.panX !== state.panX || clamped.panY !== state.panY) {
      store.setPan(clamped.panX, clamped.panY);
      return true;
    }
    return false;
  }

  async function syncActiveBitmaps(state = {}) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const item = queue.find((entry) => entry.id === state?.selectedId);
    if (!item) {
      activeOrigImg = null;
      activeCompImg = null;
      activeDiffCanvas = null;
      lastRenderKey = "";
      syncErrorOverlay(null);
      drawCanvas();
      return;
    }

    let cached = itemVisualCache.get(item.id);
    if (!cached) {
      cached = {
        origDrawable: null,
        compDrawable: null,
        diffCanvas: null,
        lastOrigData: null,
        lastOrigUrl: null,
        lastCompData: null,
        lastCompUrl: null,
      };
      itemVisualCache.set(item.id, cached);
    }

    const renderKey = `${item.id}:${item.compressSeq}:${item.quality}:${item.paletteColors}:${item.status}:${item.compSize || 0}:${item.compUrl || ""}:${item.hasAlpha}`;
    if (
      renderKey === lastRenderKey &&
      cached.lastOrigData === item.origImageData &&
      cached.lastCompData === item.compImageData
    ) {
      syncErrorOverlay(item);
      return;
    }
    lastRenderKey = renderKey;

    const currentSyncSeq = ++syncSeq;

    if (item.origImageData) {
      if (cached.lastOrigData !== item.origImageData) {
        cached.origDrawable = imageDataToDrawable(item.origImageData);
        cached.lastOrigData = item.origImageData;
        cached.lastOrigUrl = null;
        cached.diffCanvas = null;
      }
      activeOrigImg = cached.origDrawable;
    } else if (item.origUrl) {
      if (cached.lastOrigUrl !== item.origUrl) {
        try {
          const loadedOrig = await loadImage(item.origUrl);
          if (syncSeq !== currentSyncSeq) return;
          cached.origDrawable = loadedOrig;
          cached.lastOrigUrl = item.origUrl;
          cached.lastOrigData = null;
          cached.diffCanvas = null;
        } catch {
          cached.origDrawable = null;
        }
      }
      activeOrigImg = cached.origDrawable;
    } else {
      activeOrigImg = null;
    }

    const latestItem = store
      .getState()
      .queue.find((entry) => entry.id === item.id);
    if (store.getState().selectedId !== item.id) return;

    if (!activeOrigImg) {
      activeCompImg = null;
      activeDiffCanvas = null;
      syncErrorOverlay(latestItem || item);
      drawCanvas();
      return;
    }

    if (item.compImageData) {
      if (cached.lastCompData !== item.compImageData) {
        cached.compDrawable = imageDataToDrawable(item.compImageData);
        cached.lastCompData = item.compImageData;
        cached.lastCompUrl = item.compUrl || null;
        cached.diffCanvas = null;
      }
      activeCompImg = cached.compDrawable;
    } else if (item.compUrl) {
      if (cached.lastCompUrl !== item.compUrl) {
        try {
          const loadedComp = await loadImage(item.compUrl);
          if (syncSeq !== currentSyncSeq) return;
          cached.compDrawable = loadedComp;
          cached.lastCompUrl = item.compUrl;
          cached.lastCompData = null;
          cached.diffCanvas = null;
        } catch (err) {
          console.warn("Failed to load compressed image preview:", err);
          cached.compDrawable = null;
          cached.lastCompUrl = null;
        }
      }
      activeCompImg = cached.compDrawable || activeOrigImg;
    } else {
      activeCompImg = cached.compDrawable || activeOrigImg;
    }

    if (activeOrigImg && activeCompImg && activeCompImg !== activeOrigImg) {
      if (!cached.diffCanvas) {
        cached.diffCanvas = buildDiffCanvas(item, activeOrigImg, activeCompImg);
      }
      activeDiffCanvas = cached.diffCanvas;
    } else {
      activeDiffCanvas = null;
    }

    syncErrorOverlay(latestItem || item);
    drawCanvas();
  }

  function pruneStaleCache(queue) {
    const activeIds = new Set(queue.map((item) => item.id));
    for (const cachedId of itemVisualCache.keys()) {
      if (!activeIds.has(cachedId)) {
        itemVisualCache.delete(cachedId);
      }
    }
  }

  window.addEventListener("resize", resizeCanvas, { signal });

  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (!activeOrigImg) return;
      const state = store.getState();
      const rect = viewport.getBoundingClientRect();
      const next = computeWheelZoomTransform({
        currentZoom: state.zoom,
        currentStepIndex: state.zoomStepIndex,
        panX: state.panX,
        panY: state.panY,
        mouseX: Math.round(event.clientX - rect.left),
        mouseY: Math.round(event.clientY - rect.top),
        deltaY: event.deltaY,
      });
      if (next) {
        isFitMode = false;
        const imgW =
          activeOrigImg.naturalWidth || activeOrigImg.width || 0;
        const imgH =
          activeOrigImg.naturalHeight || activeOrigImg.height || 0;
        const clamped = clampPanToViewport({
          panX: next.panX,
          panY: next.panY,
          imgW,
          imgH,
          zoom: next.zoom,
          viewportW: rect.width,
          viewportH: rect.height,
        });
        const isZoomOut = event.deltaY > 0;
        const scaledW = imgW * next.zoom;
        const scaledH = imgH * next.zoom;
        const centeredPanX =
          isZoomOut && scaledW <= rect.width
            ? Math.round((rect.width - scaledW) / 2)
            : clamped.panX;
        const centeredPanY =
          isZoomOut && scaledH <= rect.height
            ? Math.round((rect.height - scaledH) / 2)
            : clamped.panY;
        store.setViewportTransform({
          zoomStepIndex: next.zoomStepIndex,
          zoom: next.zoom,
          panX: centeredPanX,
          panY: centeredPanY,
        });
      }
    },
    { signal, passive: false },
  );

  viewport.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || !activeOrigImg) return;
      if (event.target.closest(".viewport-toolbar")) return;
      const state = store.getState();
      const rect = viewport.getBoundingClientRect();
      isDragging = true;
      viewport.classList.add("is-panning");
      dragStartX = Math.round(event.clientX - rect.left - state.panX);
      dragStartY = Math.round(event.clientY - rect.top - state.panY);
    },
    { signal },
  );

  window.addEventListener(
    "mousemove",
    (event) => {
      if (!isDragging || !activeOrigImg) return;
      const rect = viewport.getBoundingClientRect();
      const state = store.getState();
      const clamped = clampPanToViewport({
        panX: event.clientX - rect.left - dragStartX,
        panY: event.clientY - rect.top - dragStartY,
        imgW: activeOrigImg.naturalWidth || activeOrigImg.width || 0,
        imgH: activeOrigImg.naturalHeight || activeOrigImg.height || 0,
        zoom: state.zoom,
        viewportW: rect.width,
        viewportH: rect.height,
      });
      store.setPan(clamped.panX, clamped.panY);
    },
    { signal },
  );

  viewport.addEventListener(
    "dblclick",
    (event) => {
      if (!activeOrigImg) return;
      if (
        event.target.closest(".viewport-toolbar") ||
        event.target.closest(".viewport-empty-prompt")
      ) {
        return;
      }
      const state = store.getState();
      if (Math.abs(state.zoom - 1.0) <= 0.01) {
        store.requestFit();
        return;
      }
      isFitMode = false;
      const rect = viewport.getBoundingClientRect();
      const next = computeExactZoomTransform({
        currentZoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        cursorX: Math.round(event.clientX - rect.left),
        cursorY: Math.round(event.clientY - rect.top),
        targetScale: 1.0,
      });
      const clamped = clampPanToViewport({
        panX: next.panX,
        panY: next.panY,
        imgW: activeOrigImg.naturalWidth || activeOrigImg.width || 0,
        imgH: activeOrigImg.naturalHeight || activeOrigImg.height || 0,
        zoom: next.zoom,
        viewportW: rect.width,
        viewportH: rect.height,
      });
      store.setViewportTransform({
        ...next,
        panX: clamped.panX,
        panY: clamped.panY,
      });
    },
    { signal },
  );

  window.addEventListener(
    "mouseup",
    () => {
      isDragging = false;
      viewport.classList.remove("is-panning");
    },
    { signal },
  );

  window.addEventListener(
    "blur",
    () => {
      isDragging = false;
      viewport.classList.remove("is-panning");
    },
    { signal },
  );

  viewport.addEventListener(
    "touchstart",
    (event) => {
      if (!activeOrigImg) return;
      if (event.target.closest(".viewport-toolbar")) return;
      const state = store.getState();
      const rect = viewport.getBoundingClientRect();
      if (event.touches.length === 1) {
        isDragging = true;
        dragStartX = Math.round(
          event.touches[0].clientX - rect.left - state.panX,
        );
        dragStartY = Math.round(
          event.touches[0].clientY - rect.top - state.panY,
        );
      } else if (event.touches.length === 2) {
        isDragging = false;
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        pinchStartDist = Math.hypot(dx, dy);
        pinchStartZoom = state.zoom;
      }
    },
    { signal, passive: true },
  );

  viewport.addEventListener(
    "touchmove",
    (event) => {
      if (!activeOrigImg) return;
      const rect = viewport.getBoundingClientRect();
      if (event.touches.length === 1 && isDragging) {
        event.preventDefault();
        const state = store.getState();
        const clamped = clampPanToViewport({
          panX: event.touches[0].clientX - rect.left - dragStartX,
          panY: event.touches[0].clientY - rect.top - dragStartY,
          imgW: activeOrigImg.naturalWidth || activeOrigImg.width || 0,
          imgH: activeOrigImg.naturalHeight || activeOrigImg.height || 0,
          zoom: state.zoom,
          viewportW: rect.width,
          viewportH: rect.height,
        });
        store.setPan(clamped.panX, clamped.panY);
      } else if (event.touches.length === 2 && pinchStartDist > 0) {
        event.preventDefault();
        const state = store.getState();
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const next = computePinchZoomTransform({
          currentZoom: state.zoom,
          currentStepIndex: state.zoomStepIndex,
          panX: state.panX,
          panY: state.panY,
          centerX:
            (event.touches[0].clientX + event.touches[1].clientX) / 2 -
            rect.left,
          centerY:
            (event.touches[0].clientY + event.touches[1].clientY) / 2 -
            rect.top,
          targetZoom: pinchStartZoom * (dist / pinchStartDist),
        });
        if (next) {
          isFitMode = false;
          store.setViewportTransform(next);
        }
      }
    },
    { signal, passive: false },
  );

  viewport.addEventListener(
    "touchend",
    (event) => {
      if (event.touches.length === 0) {
        isDragging = false;
        pinchStartDist = 0;
      }
    },
    { signal },
  );

  function render(state = {}) {
    const queue = Array.isArray(state?.queue) ? state.queue : [];
    const hasQueue = queue.length > 0;
    emptyPrompt.classList.toggle("is-hidden", hasQueue);
    pruneStaleCache(queue);

    const selectedItem = queue.find((entry) => entry.id === state?.selectedId);

    if (state.fitRequestSeq !== lastFitRequestSeq) {
      lastFitRequestSeq = state.fitRequestSeq;
      if (selectedItem) {
        lastRenderedItemId = selectedItem.id;
        pendingAutoFitId = null;
        if (selectedItem.origWidth && selectedItem.origHeight) {
          lastRenderedDims = {
            w: selectedItem.origWidth,
            h: selectedItem.origHeight,
          };
        }
        fitActiveImageToViewport(selectedItem);
      }
    } else if (state.zoom100RequestSeq !== lastZoom100RequestSeq) {
      lastZoom100RequestSeq = state.zoom100RequestSeq;
      if (selectedItem) {
        zoomActiveImageToOneToOne();
      }
    } else {
      syncViewportForSelection(selectedItem, state);
    }

    syncActiveBitmaps(state);
    scheduleDraw();
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          resizeCanvas();
        })
      : null;
  if (resizeObserver) {
    resizeObserver.observe(viewport);
  }

  const unsubscribe = store.subscribe(render);
  resizeCanvas();
  render(store.getState());

  return {
    element: viewport,
    setDragOver(isOver) {
      viewport.classList.toggle("is-drag-over", Boolean(isOver));
    },
    destroy() {
      unsubscribe();
      controller.abort();
      emptyPromptBtn.destroy();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (rafDrawId !== null) {
        cancelAnimationFrame(rafDrawId);
      }
      itemVisualCache.clear();
      viewport.remove();
    },
  };
}
