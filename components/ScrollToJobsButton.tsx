"use client";
import Link from "next/link";

/**
 * Tombol "Temukan Lowongan & Pekerja Sekitar" di hero beranda.
 *
 * Sebelumnya tombol ini scroll ke section #lowongan-terdekat DI HALAMAN
 * BERANDA YANG SAMA (pakai scrollIntoView) -- efek sampingnya section
 * "Jelajahi Peluang" di bawahnya ikut ter-render dan bisa terlihat kalau
 * user scroll lagi, karena keduanya satu halaman.
 *
 * Sekarang tombol ini membuka halaman khusus /lowongan-pekerja-terdekat
 * yang HANYA berisi "Lowongan & Pekerja Terdekat", tanpa "Jelajahi Peluang".
 */
export default function ScrollToJobsButton() {
  return (
    <Link href="/lowongan-pekerja-terdekat" className="btn-primary">
      Temukan Lowongan &amp; Pekerja Sekitar
    </Link>
  );
}
