const CACHE_NAME = "kerjahub-cache-v1";
const OFFLINE_URL = "/offline.html";

// Aset dasar yang di-cache saat install (app shell).
// Halaman lain di-cache otomatis saat dikunjungi (runtime caching di bawah).
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Hanya tangani GET; biarkan request lain (POST ke Supabase, dll) lewat langsung.
  if (request.method !== "GET") return;

  // Jangan cache request ke API/Supabase — data harus selalu fresh & realtime.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigasi halaman: coba network dulu, fallback ke cache, fallback ke halaman offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Aset statis (JS/CSS/gambar/font): cache-first, lalu update di background.
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
