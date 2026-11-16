import { createAppStore } from "../state/index.js";
import {
  evictWorkerItem,
  terminateCodecWorker,
} from "../shared/platform/codec-worker.js";
import {
  compressImageItem,
  decodeImageBytes,
  decodePreviewBytes,
} from "../shared/platform/image-codecs.js";
import {
  createBlobAndUrl,
  createObjectUrl,
  fetchDemoSampleFiles,
  loadImage,
  readFileAsUint8Array,
  revokeObjectUrl,
} from "../shared/platform/file-io.js";
import {
  createDebouncer,
  generateItemId,
} from "../shared/platform/scheduler.js";
import { mountCompressionControls } from "../widgets/compression-controls/index.js";
import { mountQueuePanel } from "../widgets/queue-panel/index.js";
import { mountViewportCanvas } from "../widgets/viewport-canvas/index.js";
import { mountViewportToolbar } from "../widgets/viewport-toolbar/index.js";

export function bootstrapApp() {
  const rootEl = document.getElementById("app");
  if (!rootEl) return null;

  const store = createAppStore({
    decodeImageBytes,
    decodePreviewBytes,
    compressImageItem,
    loadDemoSampleFiles: fetchDemoSampleFiles,
    readFileAsUint8Array,
    createBlobAndUrl,
    createObjectUrl,
    revokeObjectUrl,
    loadImage,
    evictWorkerItem,
    createDebouncer,
    generateItemId,
    logError(message, err) {
      console.error(message, err);
    },
  });

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";
  sidebar.setAttribute("aria-label", "Control panel");

  const header = document.createElement("header");
  header.className = "app-sidebar-header";

  const brandTitle = document.createElement("h1");
  brandTitle.className = "app-brand-title";
  brandTitle.textContent = "Shakalizator";
  header.appendChild(brandTitle);

  const topDivider = document.createElement("div");
  topDivider.className = "app-divider";

  const midDivider = document.createElement("div");
  midDivider.className = "app-divider";

  sidebar.appendChild(header);
  sidebar.appendChild(topDivider);

  const controlsHandle = mountCompressionControls(sidebar, { store });
  sidebar.appendChild(midDivider);
  const queueHandle = mountQueuePanel(sidebar, { store });

  const stage = document.createElement("div");
  stage.className = "app-stage";

  shell.appendChild(sidebar);
  shell.appendChild(stage);

  const viewportHandle = mountViewportCanvas(stage, {
    store,
    getSidebarOffset() {
      return 0;
    },
    onRequestUpload() {
      queueHandle.openFilePicker();
    },
  });

  const toolbarHandle = mountViewportToolbar(viewportHandle.element, { store });

  rootEl.replaceChildren(shell);

  const controller = new AbortController();
  const { signal } = controller;

  let dragDepth = 0;

  const isFileDrag = (event) =>
    Boolean(
      event.dataTransfer &&
      Array.from(event.dataTransfer.types || []).includes("Files"),
    );

  window.addEventListener(
    "dragenter",
    (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      viewportHandle.setDragOver(true);
    },
    { signal },
  );

  window.addEventListener(
    "dragover",
    (event) => {
      if (isFileDrag(event)) {
        event.preventDefault();
      }
    },
    { signal },
  );

  window.addEventListener(
    "dragleave",
    (event) => {
      if (dragDepth === 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || !event.relatedTarget) {
        dragDepth = 0;
        viewportHandle.setDragOver(false);
      }
    },
    { signal },
  );

  window.addEventListener(
    "dragend",
    () => {
      dragDepth = 0;
      viewportHandle.setDragOver(false);
    },
    { signal },
  );

  window.addEventListener(
    "blur",
    () => {
      if (dragDepth > 0) {
        dragDepth = 0;
        viewportHandle.setDragOver(false);
      }
    },
    { signal },
  );

  window.addEventListener(
    "drop",
    (event) => {
      event.preventDefault();
      dragDepth = 0;
      viewportHandle.setDragOver(false);
      if (event.dataTransfer && event.dataTransfer.files) {
        store.addFiles(event.dataTransfer.files);
      }
    },
    { signal },
  );

  let pasteCounter = 0;

  function normalizeClipboardFiles(clipboardData, existingQueue) {
    if (!clipboardData) return [];
    const collected = [];
    if (clipboardData.files && clipboardData.files.length > 0) {
      collected.push(...Array.from(clipboardData.files));
    } else if (clipboardData.items && clipboardData.items.length > 0) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) collected.push(file);
        }
      }
    }
    if (collected.length === 0) return [];

    const existingNames = new Set(existingQueue.map((item) => item.name));
    return collected.map((file) => {
      const lower = String(file.name || "").toLowerCase();
      const isGenericName =
        !file.name || /^image\.(png|jpe?g|webp)$/i.test(file.name);
      if (!isGenericName && !existingNames.has(file.name)) {
        existingNames.add(file.name);
        return file;
      }
      const ext =
        file.type === "image/webp" || lower.endsWith(".webp")
          ? "webp"
          : file.type === "image/jpeg" ||
              lower.endsWith(".jpg") ||
              lower.endsWith(".jpeg")
            ? "jpg"
            : "png";
      let candidate = "";
      do {
        pasteCounter += 1;
        candidate = `clipboard-${pasteCounter}.${ext}`;
      } while (existingNames.has(candidate));
      existingNames.add(candidate);
      return new File([file], candidate, {
        type: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
        lastModified: file.lastModified || Date.now(),
      });
    });
  }

  window.addEventListener(
    "paste",
    (event) => {
      const target = event.target;
      const tag = target && target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target && target.isContentEditable)
      ) {
        return;
      }
      const files = normalizeClipboardFiles(
        event.clipboardData,
        store.getState().queue,
      );
      if (files.length > 0) {
        event.preventDefault();
        store.addFiles(files);
      }
    },
    { signal },
  );

  window.addEventListener(
    "beforeunload",
    (event) => {
      const state = store.getState();
      const hasUnsavedItems =
        Array.isArray(state?.queue) && state.queue.length > 0;
      if (hasUnsavedItems) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    { signal },
  );

  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    const registerSW = () => {
      navigator.serviceWorker.register("./sw.js").catch((swErr) => {
        console.warn("ServiceWorker registration skipped or failed:", swErr);
      });
    };
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { signal });
    }
  }

  const cleanup = () => {
    controller.abort();
    toolbarHandle.destroy();
    viewportHandle.destroy();
    queueHandle.destroy();
    controlsHandle.destroy();
    store.destroy();
    terminateCodecWorker();
    shell.remove();
  };
  cleanup.store = store;
  cleanup.shell = shell;
  cleanup.destroy = cleanup;

  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bootstrapApp);
  } else {
    bootstrapApp();
  }
}
