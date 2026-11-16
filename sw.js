const CACHE_NAME = "shakalizator-cache-v3";

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./assets/favicon.svg",
  "./assets/og-image.png",
  "./assets/manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./demo-samples/Shakal_DEMO_JPG.jpg",
  "./demo-samples/Shakal_DEMO_PNG.png",
  "./src/styles/index.css",
  "./src/styles/theme.css",
  "./src/styles/tokens.css",
  "./src/app/main.js",
  "./src/core/index.js",
  "./src/core/compression/index.js",
  "./src/core/compression/algorithms.js",
  "./src/core/compression/constants.js",
  "./src/core/compression/diff.js",
  "./src/core/compression/format.js",
  "./src/core/viewport/index.js",
  "./src/core/viewport/zoom.js",
  "./src/state/index.js",
  "./src/state/store.js",
  "./src/shared/platform/codec-worker.js",
  "./src/shared/platform/file-io.js",
  "./src/shared/platform/image-codecs.js",
  "./src/shared/platform/scheduler.js",
  "./src/shared/ui/index.js",
  "./src/shared/ui/button/button.js",
  "./src/shared/ui/button/button.css",
  "./src/shared/ui/checkbox/checkbox.js",
  "./src/shared/ui/checkbox/checkbox.css",
  "./src/shared/ui/file-trigger/file-trigger.js",
  "./src/shared/ui/icon/icon.js",
  "./src/shared/ui/icon/icon.css",
  "./src/shared/ui/scrubber/scrubber.js",
  "./src/shared/ui/scrubber/scrubber.css",
  "./src/shared/ui/select/select.js",
  "./src/shared/ui/select/select.css",
  "./src/shared/ui/tooltip/tooltip.js",
  "./src/shared/ui/tooltip/tooltip.css",
  "./src/widgets/compression-controls/index.js",
  "./src/widgets/compression-controls/ui/compression-controls.js",
  "./src/widgets/compression-controls/ui/compression-controls.css",
  "./src/widgets/queue-panel/index.js",
  "./src/widgets/queue-panel/ui/queue-panel.js",
  "./src/widgets/queue-panel/ui/queue-panel.css",
  "./src/widgets/viewport-canvas/index.js",
  "./src/widgets/viewport-canvas/ui/viewport-canvas.js",
  "./src/widgets/viewport-canvas/ui/viewport-canvas.css",
  "./src/widgets/viewport-canvas/ui/canvas-renderer.js",
  "./src/widgets/viewport-toolbar/index.js",
  "./src/widgets/viewport-toolbar/ui/viewport-toolbar.js",
  "./src/widgets/viewport-toolbar/ui/viewport-toolbar.css",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
  "https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.min.js",
  "https://cdn.jsdelivr.net/npm/optipng-js@0.1.2/optipng.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(PRECACHE_ASSETS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 ||
              networkResponse.type === "opaque")
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Network unavailable", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          });
        });

      return cachedResponse || networkFetch;
    }),
  );
});
