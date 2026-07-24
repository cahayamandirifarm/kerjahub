// lib/notifCache.ts
//
// Cache riwayat notifikasi & penghitung badge di PERANGKAT PENGGUNA
// (IndexedDB) -- menggantikan tabel `notifications` di database sebagai
// sumber riwayat. Sejak migration 0057, baris di tabel `notifications`
// cuma perantara sesaat dan dihapus permanen begitu notifikasi terkirim,
// jadi riwayat & status "belum dibaca" sepenuhnya hidup di sini.
//
// PENTING: nama database/object store/versi di file ini HARUS SAMA PERSIS
// dengan yang dipakai di public/service-worker.js (event "push") --
// keduanya menulis ke IndexedDB yang sama, supaya notifikasi yang masuk
// lewat Web Push saat app tertutup ikut muncul di halaman /notifications
// begitu app dibuka lagi.
//
// Catatan: cache ini per-perangkat/per-browser -- riwayat TIDAK ikut
// pindah/sinkron antar perangkat, karena server memang tidak lagi
// menyimpannya sama sekali.

export const NOTIF_DB_NAME = "kerjahub-notif-cache";
export const NOTIF_DB_VERSION = 1;
export const NOTIF_STORE = "notifications";
const MAX_PER_PROFILE = 200;

export interface CachedNotif {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: string;
  is_read: boolean;
  created_at: string;
}

function openDb(): Promise<IDBDatabase> {
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

function getAllByProfile(db: IDBDatabase, profileId: string): Promise<CachedNotif[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readonly");
    const req = tx.objectStore(NOTIF_STORE).index("profile_id").getAll(profileId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function pruneOld(db: IDBDatabase, profileId: string) {
  const rows = await getAllByProfile(db, profileId);
  if (rows.length <= MAX_PER_PROFILE) return;
  const sorted = rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const toDelete = sorted.slice(MAX_PER_PROFILE);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readwrite");
    const store = tx.objectStore(NOTIF_STORE);
    toDelete.forEach((r) => store.delete(r.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheAddNotification(row: CachedNotif) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readwrite");
    tx.objectStore(NOTIF_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await pruneOld(db, row.profile_id);
  db.close();
}

export async function cacheGetAll(profileId: string): Promise<CachedNotif[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const rows = await getAllByProfile(db, profileId);
  db.close();
  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function cacheGetUnreadCount(profileId: string): Promise<number> {
  const rows = await cacheGetAll(profileId);
  return rows.filter((r) => !r.is_read).length;
}

export async function cacheMarkAllRead(profileId: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const rows = await getAllByProfile(db, profileId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NOTIF_STORE, "readwrite");
    const store = tx.objectStore(NOTIF_STORE);
    rows.forEach((r) => {
      if (!r.is_read) store.put({ ...r, is_read: true });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
