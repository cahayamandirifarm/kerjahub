const CACHE_NAME = "kerjahub-cache-v3-push";
const OFFLINE_URL = "/offline.html";

// Aset dasar yang di-cache saat install (app shell).
// Halaman lain di-cache otomatis saat dikunjungi (runtime caching di bawah).
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
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

// -------------------- Push Notification --------------------
// Halaman aktif memberi tahu SW percakapan mana yang sedang dibuka lewat
// postMessage, supaya kita tidak menampilkan notifikasi push untuk chat
// yang sedang dilihat pengguna (in-app toast sudah cukup untuk kasus itu).
let activeConversationId = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVE_CONVERSATION") {
    activeConversationId = event.data.conversationId || null;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    (async () => {
      // kalau ada tab yang fokus & sedang melihat percakapan yang sama, skip —
      // biar tidak dobel dengan toast in-app.
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const isViewingThisChat = clientsList.some(
        (c) => c.focused && payload.conversationId && activeConversationId === payload.conversationId
      );
      if (isViewingThisChat) return;

      await self.registration.showNotification(payload.title || "Pesan baru", {
        body: payload.body,
        icon: payload.icon || "/icons/icon-192.png",
        badge: payload.badge || "/icons/icon-192.png",
        tag: payload.tag,
        data: { conversationId: payload.conversationId },
        vibrate: [120, 60, 120]
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const targetUrl = conversationId ? `/chat/${conversationId}` : "/chat";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => c.url.includes(targetUrl));
      if (existing) {
        existing.focus();
      } else {
        self.clients.openWindow(targetUrl);
      }
    })()
  );
});
