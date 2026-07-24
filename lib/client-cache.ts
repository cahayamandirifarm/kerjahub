"use client";
// Cache client-side ringan untuk data publik/non-sensitif (pengaturan
// platform, banner, hasil nearby, profil, riwayat pencarian) supaya
// browser tidak selalu request ulang ke Supabase tiap kali komponen
// dibuka/dimount.
//
// PENTING -- JANGAN PERNAH pakai utilitas ini untuk: saldo, escrow,
// transaksi, chat, notifikasi, top up, withdraw, atau pembayaran. Data itu
// wajib selalu diambil langsung dari server tanpa cache.
//
// "local"  -> localStorage, dipakai untuk data kecil (setting, banner list).
// "idb"    -> IndexedDB, dipakai untuk data lebih besar (daftar pekerjaan,
//             hasil nearby, profil, riwayat pencarian).

const DEBUG = process.env.NODE_ENV !== "production";
const DB_NAME = "kerjahub-cache";
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value: IDBDatabase | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        // Bisa kejadian: tab lain masih pegang koneksi versi lama pas ada
        // upgrade, request "blocked" -- tanpa handler ini, onsuccess/onerror
        // TIDAK PERNAH terpanggil, jadi promise ini nge-hang selamanya.
        // Kejadian nyata: ini bikin loadProfile() di AuthContext ikut
        // nge-hang (nunggu readCache yang tidak pernah selesai), sehingga
        // login/registrasi kelihatan lama/gagal padahal auth-nya sendiri
        // sudah sukses.
        req.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
      // Jaring pengaman terakhir: apa pun yang terjadi, jangan pernah
      // biarkan pemanggil nunggu cache lebih dari 1.5 detik.
      setTimeout(() => finish(null), 1500);
    });
  }
  return dbPromise;
}

type Entry<T> = { value: T; savedAt: number };

// Jaring pengaman generik -- bungkus promise apa pun supaya tidak pernah
// digantung selamanya kalau IndexedDB berulah (lihat catatan di openDB()).
function withTimeout<T>(promise: Promise<T>, fallback: T, ms = 1500): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

async function idbGet<T>(key: string): Promise<Entry<T> | null> {
  const db = await openDB();
  if (!db) return null;
  return withTimeout(
    new Promise<Entry<T> | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as Entry<T>) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    null
  );
}

async function idbSet<T>(key: string, entry: Entry<T>): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return withTimeout(
    new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(entry, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    }),
    undefined
  );
}

function readLocal<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, entry: Entry<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // storage penuh / diblokir browser -- cache cuma optimisasi, aman diabaikan
  }
}

let hitCount = 0;
let missCount = 0;
export function getCacheStats() {
  return { hitCount, missCount };
}

/**
 * Stale-while-revalidate untuk data client-side.
 * 1. Kalau ada data di cache, langsung tampilkan lewat onData(value, true).
 * 2. Kalau cache kosong atau sudah lewat ttlMs, ambil data baru dari
 *    `fetcher`, simpan ke cache, dan panggil onData lagi kalau datanya beda.
 */
export async function swrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  onData: (value: T, fromCache: boolean) => void,
  store: "local" | "idb" = "local"
): Promise<void> {
  const cacheKey = `kh:${key}`;
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cached = store === "local" ? readLocal<T>(cacheKey) : await idbGet<T>(cacheKey);

  let isFresh = false;
  if (cached) {
    hitCount++;
    if (DEBUG) console.debug(`[cache] hit "${key}" (umur ${Math.round((Date.now() - cached.savedAt) / 1000)}s)`);
    onData(cached.value, true);
    isFresh = Date.now() - cached.savedAt < ttlMs;
  } else {
    missCount++;
    if (DEBUG) console.debug(`[cache] miss "${key}"`);
  }

  if (isFresh) return;

  try {
    const fresh = await fetcher();
    const entry: Entry<T> = { value: fresh, savedAt: Date.now() };
    if (store === "local") writeLocal(cacheKey, entry);
    else await idbSet(cacheKey, entry);

    if (!cached || JSON.stringify(cached.value) !== JSON.stringify(fresh)) {
      onData(fresh, false);
    }
    if (DEBUG) {
      const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started);
      console.debug(`[cache] revalidated "${key}" dalam ${ms}ms (hit=${hitCount} miss=${missCount})`);
    }
  } catch (err) {
    // Gagal (mis. offline) -- kalau sudah ada data cache lama, biarkan tetap
    // tampil (itulah gunanya cache saat offline); kalau tidak ada, diam saja,
    // komponen pemanggil yang menentukan tampilan kosong/error.
    if (DEBUG) console.debug(`[cache] revalidate gagal "${key}"`, err);
  }
}

/** Simpan nilai langsung ke cache tanpa lewat fetch (mis. profil setelah login). */
export async function writeCache<T>(key: string, value: T, store: "local" | "idb" = "local") {
  const entry: Entry<T> = { value, savedAt: Date.now() };
  if (store === "local") writeLocal(`kh:${key}`, entry);
  else await idbSet(`kh:${key}`, entry);
}

export async function readCache<T>(key: string, store: "local" | "idb" = "local"): Promise<T | null> {
  const cached = store === "local" ? readLocal<T>(`kh:${key}`) : await idbGet<T>(`kh:${key}`);
  return cached?.value ?? null;
}
