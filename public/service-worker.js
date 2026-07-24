// Versi cache dinaikkan tiap kali daftar aset/precache berubah -- browser
// otomatis pakai cache baru dan menghapus semua cache versi lama lewat
// event "activate" di bawah (cache versioning).
const CACHE_NAME = "kerjahub-cache-v5-perf-cache";
const OFFLINE_URL = "/offline.html";

// Aset dasar (app shell) yang di-cache saat install: HTML offline fallback,
// manifest PWA, dan seluruh ukuran icon yang dipakai (home screen, splash,
// maskable Android). Halaman/CSS/JS/gambar lain di-cache otomatis saat
// dikunjungi lewat runtime caching di bawah.
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-256.png",
  "/icons/icon-384.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
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

// -------------------- Cache riwayat notifikasi (IndexedDB) --------------------
// Sejak migration 0057, baris di tabel `notifications` dihapus permanen
// begitu terkirim -- server tidak lagi menyimpan riwayat atau menghitung
// angka badge. Skema di bawah HARUS SAMA PERSIS dengan lib/notifCache.ts
// (dipakai saat app terbuka) supaya notifikasi yang masuk lewat push di
// sini ikut muncul di halaman /notifications begitu app dibuka lagi, dan
// angka badge yang dihitung tetap konsisten satu sama lain.
const NOTIF_DB_NAME = "kerjahub-notif-cache";
const NOTIF_DB_VERSION = 1;
const NOTIF_STORE = "notifications";

function notifOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOTIF_DB_NAME, NOTIF_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTIF_STORE)) {
        const store = db.createObjectStore(NOTIF_STORE, { keyPath: "id" });
        store.createIndex("profile_id", "profile_id", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function notifCacheAdd(row) {
  const db = await notifOpenDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readwrite");
    tx.objectStore(NOTIF_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function notifCacheUnreadCount(profileId) {
  const db = await notifOpenDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readonly");
    const req = tx.objectStore(NOTIF_STORE).index("profile_id").getAll(profileId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.filter((r) => !r.is_read).length;
}

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
      // Sejak migration 0057, tabel `notifications` tidak lagi menyimpan
      // riwayat permanen di server, jadi server juga tidak bisa lagi
      // menghitung "total notifikasi belum dibaca" untuk badge. Sebagai
      // gantinya, notifikasi ini disimpan ke cache lokal (IndexedDB) di
      // PERANGKAT INI, lalu angka badge dihitung dari cache tersebut --
      // sama seperti riwayat yang ditampilkan halaman /notifications.
      //
      // PENTING: badge ini WAJIB selalu disinkronkan di sini, TIDAK BOLEH
      // ikut di-skip oleh pengecekan "isViewingThisChat" di bawah. Badge
      // mewakili total notifikasi belum dibaca di SELURUH app (termasuk
      // hasil nego harga, pembayaran, lamaran, dll), bukan cuma percakapan
      // yang sedang dibuka.
      if (payload.profile_id) {
        try {
          await notifCacheAdd({
            id: payload.notification_id || `sw-${Date.now()}`,
            profile_id: payload.profile_id,
            title: payload.title || "Notifikasi baru",
            body: payload.body || null,
            link: payload.url || null,
            category: payload.category || (payload.conversationId ? "chat" : "umum"),
            is_read: false,
            created_at: new Date().toISOString()
          });
          if ("setAppBadge" in self.navigator) {
            const unread = await notifCacheUnreadCount(payload.profile_id);
            if (unread > 0) {
              self.navigator.setAppBadge(unread).catch(() => {});
            } else {
              self.navigator.clearAppBadge().catch(() => {});
            }
          }
        } catch {
          // gagal simpan ke cache/hitung badge tidak boleh menggagalkan
          // tampilnya notifikasi push itu sendiri
        }
      }

      // kalau ada tab yang BENAR-BENAR TERLIHAT (bukan sekadar "focused" —
      // di Android, status focused tab kadang belum langsung berubah saat
      // app dipindah ke background tapi layar masih menyala) & sedang
      // melihat percakapan yang sama, skip TOAST/notifikasi visualnya saja —
      // biar tidak dobel dengan toast in-app. Badge di atas tetap jalan.
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const isViewingThisChat = clientsList.some(
        (c) =>
          c.visibilityState === "visible" &&
          payload.conversationId &&
          activeConversationId === payload.conversationId
      );
      if (isViewingThisChat) return;

      await self.registration.showNotification(payload.title || "Notifikasi baru", {
        body: payload.body,
        icon: payload.icon || "/icons/icon-192.png",
        badge: payload.badge || "/icons/icon-192.png",
        tag: payload.tag,
        data: { url: payload.url || (payload.conversationId ? `/chat/${payload.conversationId}` : "/") },
        // notifikasi pekerjaan (lamaran/pesanan/pembayaran) sengaja dibuat
        // "menempel" di layar (tidak hilang sendiri dalam beberapa detik)
        // dan getarnya lebih tegas, supaya tidak gampang lewat begitu saja —
        // chat tetap pakai getar standar biar tidak berlebihan untuk obrolan biasa.
        requireInteraction: payload.urgent !== false,
        vibrate: payload.urgent === false ? [120, 60, 120] : [200, 100, 200, 100, 200]
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

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
