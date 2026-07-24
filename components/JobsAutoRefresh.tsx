"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { readCache, writeCache } from "@/lib/client-cache";

// Bikin daftar postingan (pemberi upah/penerima upah) di beranda terasa
// realtime TANPA subscribe Supabase Realtime ke seluruh tabel jobs (yang
// akan lebih berat & butuh koneksi terus-terusan untuk sesuatu yang publik
// dan boleh sedikit delay).
//
// Cara kerja:
// 1. Device pengguna menyimpan 2 penanda kecil di cache lokal (localStorage,
//    lewat lib/client-cache.ts): `latestPostId` (postingan terbaru) dan
//    `latestUpdateId` (postingan yang TERAKHIR diubah/repost/dinonaktifkan).
// 2. Setiap POLL_INTERVAL_MS, komponen ini fetch endpoint ringan
//    /api/jobs/latest-marker (di-cache 20 detik di server, lihat
//    lib/cached-queries.ts) untuk tahu id terbaru saat ini.
// 3. Kalau id yang didapat beda dari yang tersimpan di device, artinya ada
//    postingan baru atau ada perubahan -- baru saat itu panggil
//    router.refresh() untuk menarik data asli yang sudah fresh.
// 4. Tidak polling saat tab sedang tidak aktif (document.hidden), supaya
//    tidak menambah beban saat tidak ada yang benar-benar melihat halaman.
const POLL_INTERVAL_MS = 20000;

export default function JobsAutoRefresh({ tipe, kategori }: { tipe: "employer" | "worker"; kategori?: string }) {
  const router = useRouter();
  const cacheKey = `jobs-marker:${tipe}:${kategori || "semua"}`;
  const checking = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      if (document.hidden || checking.current) return;
      checking.current = true;
      try {
        const params = new URLSearchParams({ tipe });
        if (kategori) params.set("kategori", kategori);
        const res = await fetch(`/api/jobs/latest-marker?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const marker = await res.json();
        if (cancelled) return;

        const previous = await readCache<typeof marker>(cacheKey, "local");
        await writeCache(cacheKey, marker, "local");

        // Baru trigger refresh kalau memang sudah pernah ada penanda
        // tersimpan sebelumnya (bukan kunjungan pertama) DAN salah satu
        // penanda berubah.
        if (
          previous &&
          (previous.latestPostId !== marker.latestPostId || previous.latestUpdateId !== marker.latestUpdateId)
        ) {
          router.refresh();
        }
      } catch {
        // Best-effort -- gagal polling (offline dsb) tidak perlu ditampilkan ke pengguna.
      } finally {
        checking.current = false;
      }
    }

    checkForUpdates();
    const interval = setInterval(checkForUpdates, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkForUpdates);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkForUpdates);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipe, kategori]);

  return null;
}
