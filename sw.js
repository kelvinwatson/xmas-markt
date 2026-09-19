// Basic hand-rolled service worker.
// Upgrade path: swap this for Workbox (https://developer.chrome.com/docs/workbox/)
// once the app grows — it gives you more caching strategies out of the box.

const STATIC_CACHE = "cmapp-static-v17";
const DATA_CACHE = "cmapp-data-v1";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  // cache.addAll() can be satisfied by the browser's regular HTTP cache,
  // which would silently repopulate this cache with stale files on every
  // redeploy. Fetch with {cache: "reload"} to force a real network hit.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          fetch(url, { cache: "reload" }).then((response) => cache.put(url, response))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isData = url.pathname.includes("/data/");

  if (isData) {
    // Network-first: markets/vendors change with each scrape, so prefer
    // fresh data when online, but fall back to cache when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Cache-first for the app shell itself.
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
