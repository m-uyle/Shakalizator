import {
  DEFAULT_PALETTE_COLORS,
  DEFAULT_QUALITY,
  RECOMPRESS_DEBOUNCE_MS,
  computeItemDegreePatch,
  detectAlphaChannel,
  detectFormat,
  getCompatibleAlgorithms,
  getDefaultAlgorithm,
  isSupportedImageFile,
  sortFilesNaturally,
} from "../core/compression/index.js";
import {
  DEFAULT_ZOOM_STEP_INDEX,
  HARMONIC_STEPS,
} from "../core/viewport/index.js";

function formatUserErrorMessage(err) {
  const raw =
    err && typeof err === "object" && "message" in err && err.message
      ? String(err.message).trim()
      : "";
  if (
    !raw ||
    /unwrap_throw|exit\(|runtimeerror|aborted|unreachable/i.test(raw)
  ) {
    return "File appears corrupted or unsupported";
  }
  return raw;
}

export function createAppStore(platform) {
  const logError =
    platform && typeof platform.logError === "function"
      ? platform.logError.bind(platform)
      : console.error;
  const debouncer =
    platform && typeof platform.createDebouncer === "function"
      ? platform.createDebouncer(RECOMPRESS_DEBOUNCE_MS)
      : { schedule: (fn) => fn(), cancel: () => {} };
  const listeners = new Set();

  let state = {
    queue: [],
    selectedId: null,
    zoomStepIndex: DEFAULT_ZOOM_STEP_INDEX,
    zoom: HARMONIC_STEPS[DEFAULT_ZOOM_STEP_INDEX],
    panX: 0,
    panY: 0,
    isDiffActive: false,
    isHoldingBlink: false,
    isExportingZip: false,
    isLoadingDemo: false,
    fitRequestSeq: 0,
    zoom100RequestSeq: 0,
    notice: null,
  };

  let noticeSeq = 0;

  function showNotice(text, tone = "info") {
    noticeSeq += 1;
    updateState({ notice: { seq: noticeSeq, text, tone } });
  }

  function releaseItemResources(item) {
    if (!item) return;
    if (item.origUrl && typeof platform?.revokeObjectUrl === "function") {
      platform.revokeObjectUrl(item.origUrl);
    }
    if (item.compUrl && typeof platform?.revokeObjectUrl === "function") {
      platform.revokeObjectUrl(item.compUrl);
    }
    if (item.id && typeof platform?.evictWorkerItem === "function") {
      platform.evictWorkerItem(item.id);
    }
  }

  function getViewportPatchForQueue(nextQueue, nextSelectedId) {
    if (nextQueue.length === 0 || !nextSelectedId) {
      return {
        zoomStepIndex: DEFAULT_ZOOM_STEP_INDEX,
        zoom: HARMONIC_STEPS[DEFAULT_ZOOM_STEP_INDEX],
        panX: 0,
        panY: 0,
        isDiffActive: false,
        isHoldingBlink: false,
      };
    }
    return {
      isDiffActive: state.isDiffActive,
      isHoldingBlink: state.isHoldingBlink,
    };
  }

  function purgeDemoItems() {
    const demoItems = state.queue.filter((item) => item.isDemo);
    if (demoItems.length === 0) return;

    for (const demoItem of demoItems) {
      releaseItemResources(demoItem);
    }

    const nextQueue = state.queue.filter((item) => !item.isDemo);
    const removedSelected = demoItems.some(
      (item) => item.id === state.selectedId,
    );
    const nextSelectedId = removedSelected
      ? nextQueue.length > 0
        ? nextQueue[0].id
        : null
      : state.selectedId;

    updateState({
      queue: nextQueue,
      selectedId: nextSelectedId,
      ...getViewportPatchForQueue(nextQueue, nextSelectedId),
    });
  }

  function notify() {
    for (const listener of Array.from(listeners)) {
      try {
        listener(state);
      } catch (err) {
        logError("Subscriber notification failed:", err);
      }
    }
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    notify();
  }

  function updateItem(id, updater) {
    const nextQueue = state.queue.map((item) =>
      item.id === id
        ? typeof updater === "function"
          ? updater(item)
          : { ...item, ...updater }
        : item,
    );
    updateState({ queue: nextQueue });
  }

  function getTargetItems() {
    const checked = state.queue.filter((item) => item.checked);
    if (checked.length > 0) return checked;
    const active = state.queue.find((item) => item.id === state.selectedId);
    return active ? [active] : [];
  }

  let compressionChain = Promise.resolve();

  function enqueueCompression(id) {
    compressionChain = compressionChain
      .then(() => compressItemById(id))
      .catch((err) => {
        logError("Queued compression error:", err);
      });
    return compressionChain;
  }

  async function compressItemById(id) {
    const current = state.queue.find((item) => item.id === id);
    if (!current || current.status !== "pending") return;

    const targetSeq = current.compressSeq;
    updateItem(id, { status: "processing" });

    try {
      const latest = state.queue.find((item) => item.id === id);
      if (!latest || latest.compressSeq !== targetSeq) return;

      const { outputBlob, outBytes, decFormat } =
        await platform.compressImageItem(latest, latest.origImageData);
      const after = state.queue.find((item) => item.id === id);
      if (!after || after.compressSeq !== targetSeq) return;

      let compImageData = null;
      try {
        compImageData = await platform.decodePreviewBytes(outBytes, decFormat);
      } catch (decodeErr) {
        logError("Parallel preview decode failed:", decodeErr);
      }

      const finalCheck = state.queue.find((item) => item.id === id);
      if (!finalCheck || finalCheck.compressSeq !== targetSeq) return;

      if (finalCheck.compUrl) {
        platform.revokeObjectUrl(finalCheck.compUrl);
      }

      updateItem(id, {
        compImageData: state.selectedId === id ? compImageData : null,
        compBlob: outputBlob,
        compUrl: platform.createObjectUrl(outputBlob),
        compSize: outputBlob.size,
        errorMessage: null,
        status: "done",
      });
    } catch (err) {
      const after = state.queue.find((item) => item.id === id);
      if (!after || after.compressSeq !== targetSeq) return;
      const errorMessage = formatUserErrorMessage(err);
      logError("Compression failed:", err);
      updateItem(id, { status: "error", errorMessage });
      showNotice(`${after.name || "File"}: ${errorMessage}`, "error");
    }
  }

  function scheduleRecompress(targetIds) {
    debouncer.schedule(() => {
      const idsToRun =
        Array.isArray(targetIds) && targetIds.length > 0
          ? targetIds
          : getTargetItems().map((item) => item.id);
      for (const id of idsToRun) {
        enqueueCompression(id);
      }
    });
  }

  function startParallelOriginalPreview(
    id,
    origUrl,
    rawBytes,
    format,
    shouldFitOnDimensions,
  ) {
    platform
      .loadImage(origUrl)
      .then((img) => {
        const current = state.queue.find((item) => item.id === id);
        if (!current) return;
        const needDimensions = !current.origWidth || !current.origHeight;
        if (needDimensions) {
          updateItem(id, {
            origWidth: img.naturalWidth,
            origHeight: img.naturalHeight,
          });
        }
        if (shouldFitOnDimensions && state.selectedId === id) {
          updateState({ fitRequestSeq: state.fitRequestSeq + 1 });
        }
      })
      .catch((imgErr) => {
        const readableErr =
          imgErr && typeof imgErr === "object" && "message" in imgErr
            ? imgErr
            : new Error("Failed to decode image preview");
        logError("Native preview load failed:", readableErr);
      });

    platform
      .decodeImageBytes(id, rawBytes, format)
      .then((origImageData) => {
        const current = state.queue.find((item) => item.id === id);
        if (!current) return;
        const hasAlpha =
          format === "png" || format === "webp"
            ? detectAlphaChannel(origImageData.data)
            : false;
        const hadNoDimensions = !current.origWidth || !current.origHeight;
        updateItem(id, {
          origImageData: state.selectedId === id ? origImageData : null,
          origWidth: origImageData.width,
          origHeight: origImageData.height,
          hasAlpha,
        });
        if (
          hadNoDimensions &&
          shouldFitOnDimensions &&
          state.selectedId === id
        ) {
          updateState({ fitRequestSeq: state.fitRequestSeq + 1 });
        }
      })
      .catch((decodeErr) => {
        logError("Background original decode failed:", decodeErr);
      });
  }

  async function addSingleFile(
    file,
    { isDemo = false, forceSelect = false } = {},
  ) {
    const id = platform.generateItemId();
    const rawBytes = await platform.readFileAsUint8Array(file);
    const format = detectFormat(file.name, file.type, rawBytes);
    const mimeType =
      format === "webp"
        ? "image/webp"
        : format === "png"
          ? "image/png"
          : "image/jpeg";
    const { blob: origBlob, url: origUrl } = platform.createBlobAndUrl(
      rawBytes,
      mimeType,
    );

    const newItem = {
      id,
      name: file.name,
      format,
      isDemo: Boolean(isDemo),
      hasAlpha: false,
      origSize: rawBytes.byteLength,
      origBlob,
      origUrl,
      rawBytes,
      origImageData: null,
      compImageData: null,
      origWidth: 0,
      origHeight: 0,
      method: getDefaultAlgorithm(format),
      quality: DEFAULT_QUALITY,
      paletteColors: DEFAULT_PALETTE_COLORS,
      compressSeq: 1,
      checked: false,
      compBlob: null,
      compUrl: null,
      compSize: null,
      errorMessage: null,
      status: "pending",
    };

    const wasEmpty = state.queue.length === 0;
    const shouldAutoSelect = forceSelect || !state.selectedId || wasEmpty;
    updateState({
      queue: [...state.queue, newItem],
      selectedId: shouldAutoSelect ? id : state.selectedId,
    });

    startParallelOriginalPreview(
      id,
      origUrl,
      rawBytes,
      format,
      shouldAutoSelect,
    );
    enqueueCompression(id);
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async addFiles(fileList) {
      const incoming = Array.from(fileList || []);
      const supported = incoming.filter((file) =>
        isSupportedImageFile(file.name, file.type),
      );
      if (supported.length === 0) {
        if (incoming.length > 0) {
          showNotice("Unsupported format (use PNG, JPEG, WebP)", "error");
        }
        return;
      }

      const skippedCount = incoming.length - supported.length;
      if (skippedCount > 0) {
        showNotice(
          `Skipped ${skippedCount} unsupported file${skippedCount > 1 ? "s" : ""}`,
          "info",
        );
      }

      purgeDemoItems();

      const sorted = sortFilesNaturally(supported);
      for (const file of sorted) {
        await addSingleFile(file, { isDemo: false });
      }
    },
    showNotice(text, tone = "info") {
      showNotice(text, tone);
    },
    async loadDemoSamples() {
      if (
        state.isLoadingDemo ||
        typeof platform.loadDemoSampleFiles !== "function"
      )
        return;

      updateState({ isLoadingDemo: true });
      try {
        const files = await platform.loadDemoSampleFiles();
        const existingDemoNames = new Set(
          state.queue.filter((item) => item.isDemo).map((item) => item.name),
        );
        const missingFiles = files.filter(
          (file) => !existingDemoNames.has(file.name),
        );

        if (missingFiles.length === 0) {
          const firstDemo = state.queue.find((item) => item.isDemo);
          if (firstDemo && state.selectedId !== firstDemo.id) {
            updateState({
              selectedId: firstDemo.id,
              fitRequestSeq: state.fitRequestSeq + 1,
            });
          }
          return;
        }

        for (let i = 0; i < missingFiles.length; i += 1) {
          await addSingleFile(missingFiles[i], {
            isDemo: true,
            forceSelect: i === 0 && existingDemoNames.size === 0,
          });
        }
      } catch (err) {
        logError("Failed to load demo samples:", err);
        showNotice("Failed to load demo samples", "error");
      } finally {
        updateState({ isLoadingDemo: false });
      }
    },
    removeItems(ids) {
      const idSet = new Set(Array.isArray(ids) ? ids : []);
      if (idSet.size === 0) return;

      const toRemove = state.queue.filter((item) => idSet.has(item.id));
      if (toRemove.length === 0) return;

      for (const target of toRemove) {
        releaseItemResources(target);
      }

      const nextQueue = state.queue.filter((item) => !idSet.has(item.id));
      let nextSelectedId = state.selectedId;
      if (idSet.has(state.selectedId)) {
        const oldIdx = state.queue.findIndex(
          (item) => item.id === state.selectedId,
        );
        nextSelectedId = null;
        for (let i = oldIdx + 1; i < state.queue.length; i += 1) {
          if (!idSet.has(state.queue[i].id)) {
            nextSelectedId = state.queue[i].id;
            break;
          }
        }
        if (!nextSelectedId && nextQueue.length > 0) {
          nextSelectedId = nextQueue[nextQueue.length - 1].id;
        }
      }

      updateState({
        queue: nextQueue,
        selectedId: nextSelectedId,
        ...getViewportPatchForQueue(nextQueue, nextSelectedId),
      });
    },
    removeItem(id) {
      const target = state.queue.find((item) => item.id === id);
      if (!target) return;

      const oldIdx = state.queue.findIndex((item) => item.id === id);
      releaseItemResources(target);

      const nextQueue = state.queue.filter((item) => item.id !== id);
      const removingSelected = state.selectedId === id;
      const nextSelectedId = removingSelected
        ? nextQueue.length > 0
          ? nextQueue[Math.min(oldIdx, nextQueue.length - 1)].id
          : null
        : state.selectedId;

      updateState({
        queue: nextQueue,
        selectedId: nextSelectedId,
        ...getViewportPatchForQueue(nextQueue, nextSelectedId),
      });
    },
    selectItem(id) {
      if (!state.queue.some((item) => item.id === id)) return;
      if (state.selectedId === id) return;
      const oldId = state.selectedId;
      if (oldId) {
        updateItem(oldId, { origImageData: null, compImageData: null });
      }
      updateState({ selectedId: id });
    },
    selectAdjacentItem(delta) {
      if (state.queue.length === 0) return;
      const currentIdx = state.queue.findIndex(
        (item) => item.id === state.selectedId,
      );
      const baseIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = Math.max(
        0,
        Math.min(state.queue.length - 1, baseIdx + delta),
      );
      const target = state.queue[nextIdx];
      if (target && target.id !== state.selectedId) {
        const oldId = state.selectedId;
        if (oldId) {
          updateItem(oldId, { origImageData: null, compImageData: null });
        }
        updateState({ selectedId: target.id });
      }
    },
    toggleItemCheck(id, checked) {
      updateItem(id, { checked: Boolean(checked) });
    },
    toggleSelectAll(checked) {
      const nextChecked = Boolean(checked);
      updateState({
        queue: state.queue.map((item) => ({ ...item, checked: nextChecked })),
      });
    },
    setAlgorithm(nextMethod) {
      const targets = getTargetItems();
      const changedIds = [];
      const targetIdSet = new Set(targets.map((item) => item.id));

      const nextQueue = state.queue.map((item) => {
        if (!targetIdSet.has(item.id)) return item;
        const allowed = getCompatibleAlgorithms(item.format);
        if (allowed.includes(nextMethod) && item.method !== nextMethod) {
          changedIds.push(item.id);
          return {
            ...item,
            method: nextMethod,
            compressSeq: item.compressSeq + 1,
            status: "pending",
          };
        }
        return item;
      });

      if (changedIds.length > 0) {
        updateState({ queue: nextQueue });
        scheduleRecompress(changedIds);
      }
    },
    setDegree(val) {
      const targets = getTargetItems();
      const changedIds = [];
      const patchById = new Map();

      for (const item of targets) {
        const res = computeItemDegreePatch(item, val);
        if (res.changed && res.patch) {
          changedIds.push(item.id);
          patchById.set(item.id, {
            ...res.patch,
            compressSeq: item.compressSeq + 1,
            status: "pending",
          });
        }
      }

      if (changedIds.length > 0) {
        const nextQueue = state.queue.map((item) =>
          patchById.has(item.id)
            ? { ...item, ...patchById.get(item.id) }
            : item,
        );
        updateState({ queue: nextQueue });
        scheduleRecompress(changedIds);
      }
    },
    setViewportTransform(transform = {}) {
      const { zoomStepIndex, zoom, panX, panY } = transform || {};
      const patch = {};
      if (Number.isFinite(zoomStepIndex)) patch.zoomStepIndex = zoomStepIndex;
      if (Number.isFinite(zoom)) patch.zoom = zoom;
      if (Number.isFinite(panX)) patch.panX = panX;
      if (Number.isFinite(panY)) patch.panY = panY;
      if (Object.keys(patch).length > 0) {
        updateState(patch);
      }
    },
    setPan(panX, panY) {
      const patch = {};
      if (Number.isFinite(panX)) patch.panX = panX;
      if (Number.isFinite(panY)) patch.panY = panY;
      if (Object.keys(patch).length > 0) {
        updateState(patch);
      }
    },
    requestFit() {
      if (!state.selectedId) return;
      updateState({ fitRequestSeq: state.fitRequestSeq + 1 });
    },
    requestZoomOneToOne() {
      if (!state.selectedId) return;
      updateState({ zoom100RequestSeq: state.zoom100RequestSeq + 1 });
    },
    toggleDiff() {
      const active = state.queue.find((item) => item.id === state.selectedId);
      if (
        !active ||
        active.status === "error" ||
        (!active.compImageData && !active.compUrl)
      ) {
        return;
      }
      updateState({ isDiffActive: !state.isDiffActive });
    },
    setBlinkHold(isHolding) {
      const nextHold = Boolean(isHolding);
      if (nextHold) {
        const active = state.queue.find((item) => item.id === state.selectedId);
        if (
          !active ||
          active.status === "error" ||
          (!active.compImageData && !active.compUrl)
        ) {
          return;
        }
      }
      if (state.isHoldingBlink === nextHold) return;
      updateState({ isHoldingBlink: nextHold });
    },
    setExportingZip(isExporting) {
      updateState({ isExportingZip: Boolean(isExporting) });
    },
    destroy() {
      debouncer.cancel();
      listeners.clear();
      for (const item of state.queue) {
        releaseItemResources(item);
      }
      state = { ...state, queue: [], selectedId: null };
    },
  };
}
