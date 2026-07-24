import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Dipanggil dari client setelah user membuat/mengedit/menghapus/mengubah
// status postingan kerja (jobs) atau produk marketplace (digital_listings).
//
// KENAPA INI PERLU: halaman beranda & marketplace sekarang mengambil data
// lewat lib/cached-queries.ts (unstable_cache, revalidate 1800 detik) supaya
// bisa di-ISR-kan. Tapi semua form/tombol create-update-delete-toggle di
// dashboard & admin melakukan mutasi langsung dari client (Supabase browser
// client) tanpa lewat Server Action/Route Handler -- jadi tidak ada yang
// pernah memanggil revalidateTag di sisi server. Akibatnya cache "jobs-list"
// / "marketplace-list" tidak pernah di-invalidate, dan postingan yang baru
// dibuat/diubah baru muncul di beranda & marketplace setelah cache
// kedaluwarsa sendiri (bisa sampai 30 menit).
//
// Route ini men-trigger revalidateTag untuk kedua tag itu supaya perubahan
// langsung tampil. Tidak perlu auth ketat -- worst case cuma memaksa
// beranda/marketplace query ulang ke DB lebih sering, bukan celah keamanan.
export async function POST() {
  revalidateTag("jobs-list");
  revalidateTag("marketplace-list");
  return NextResponse.json({ revalidated: true, now: Date.now() });
}
