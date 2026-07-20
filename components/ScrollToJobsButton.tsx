"use client";

/**
 * Tombol "Temukan Lowongan & Pekerja Sekitar" di hero beranda.
 *
 * Sebelumnya pakai <a href="#daftar-kerja"> biasa (native hash anchor).
 * Masalahnya: begitu banner/gambar di atas section target selesai dimuat
 * SETELAH browser melompat ke anchor, tinggi halaman berubah dan posisi
 * scroll jadi meleset lagi ke atas -- makanya user harus scroll manual ke
 * bawah lagi.
 *
 * Fix: scroll dipicu langsung saat diklik (bukan lewat URL hash), memakai
 * scrollIntoView. Karena dieksekusi imperatif tepat pas user klik, ini
 * memakai posisi elemen SAAT ITU (halaman sudah settle), jadi tidak
 * kena efek "loncat lalu geser lagi" seperti hash anchor.
 */
export default function ScrollToJobsButton() {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    // Section nearby cuma render kalau browser sudah dapat izin lokasi.
    // Kalau belum ada (elemen tidak ditemukan), fallback ke daftar
    // lowongan umum supaya tombol tetap merespons, bukan diam saja.
    const target = document.getElementById("lowongan-terdekat") ?? document.getElementById("daftar-kerja");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <a href="#lowongan-terdekat" onClick={handleClick} className="btn-primary">
      Temukan Lowongan &amp; Pekerja Sekitar
    </a>
  );
}
