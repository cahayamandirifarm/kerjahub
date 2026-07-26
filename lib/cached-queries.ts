import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// Menyamakan judul untuk deteksi "produk/jasa yang sama atau mirip" dari
// akun yang sama -- huruf kecil, tanda baca & spasi ganda dibuang, supaya
// "Jasa Potong Rumput!!" dan "jasa potong rumput" dianggap sama.
function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Dari daftar postingan/listing (sudah diurutkan sesuai prioritas tampil),
// sisakan hanya 1 per kombinasi (pemilik, judul mirip) -- yang pertama
// ditemukan (paling diprioritaskan) yang dipertahankan.
function dedupeByOwnerAndTitle<T extends { title: string }>(items: T[], ownerId: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${ownerId(item)}::${normalizeTitle(item.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

// Urutan prioritas tampil: rating tertinggi > pesanan/pekerjaan selesai
// terbanyak > paling sering dilihat > terbaru. Dipakai supaya "populer"
// (akun rating tinggi & laris) lebih menonjol di beranda/marketplace.
function sortByPopularity<T extends { view_count?: number; created_at: string; profiles?: { rating_avg: number; completed_jobs_count: number } | null }>(
  items: T[]
) {
  return [...items].sort((a, b) => {
    const ratingDiff = (b.profiles?.rating_avg ?? 0) - (a.profiles?.rating_avg ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    const completedDiff = (b.profiles?.completed_jobs_count ?? 0) - (a.profiles?.completed_jobs_count ?? 0);
    if (completedDiff !== 0) return completedDiff;
    const viewDiff = (b.view_count ?? 0) - (a.view_count ?? 0);
    if (viewDiff !== 0) return viewDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// Query publik yang di-cache di sisi server (Next.js Data Cache / Vercel).
// Dipakai di server component yang TIDAK butuh cookies/auth (halaman
// beranda & marketplace), supaya route-nya bisa ikut di-cache (ISR) dan
// tidak query Supabase di setiap kunjungan.
//
// JANGAN tambahkan query di sini untuk data yang personal/sensitif (saldo,
// escrow, transaksi, chat, notifikasi, dsb) -- itu wajib selalu fresh per
// pengguna dan tidak boleh di-cache lintas pengguna.

// Postingan kerja terbuka di beranda -- cache 30 menit (dinaikkan dari 15
// menit untuk mengurangi frekuensi query ke DB & beban CPU compute yang
// kecil). Ambil sedikit lebih banyak baris dari yang ditampilkan (limit 40)
// karena setelah di-dedup per akun (judul sama/mirip disisakan 1) jumlahnya
// bisa berkurang -- lalu dipotong ke 30 hasil akhir.
// PENTING (pagination 10/halaman): fungsi ini mengembalikan SATU pool hasil
// yang sudah diranking+dedup, lalu halaman (app/page.tsx) yang memotongnya
// 10 per halaman lewat parameter ?page= -- bukan query per-halaman ke DB,
// supaya urutan populer (rating/laris/dilihat/terbaru) & dedup akun tetap
// konsisten lintas halaman. Limit pool dinaikkan jadi 150/100 (dari
// 40/30) supaya cukup untuk beberapa halaman.
export const getHomeJobs = unstable_cache(
  async (tipe: "employer" | "worker", kategori?: string) => {
    const supabase = createPublicClient();
    // PENTING (bugfix 0068): dulu di sini pakai .from("jobs").select("*, profiles!...(...)")
    // -- baris job-nya sendiri sudah benar tampil (RLS jobs sudah oke sejak
    // 0064/0067), TAPI field job.profiles SELALU null utk akses publik,
    // karena embed relasi PostgREST ke `profiles` adalah query terpisah yang
    // tunduk RLS tabel profiles sendiri (cuma boleh dibaca role
    // "authenticated", client publik di sini SELALU anon). Makanya foto
    // profil/badge rating tidak pernah tampil di beranda walau job-nya
    // muncul normal. RPC get_home_jobs (security definer, lihat migration
    // 0068) join ke profiles DI DALAM function-nya sendiri (bypass RLS utk
    // itu), jadi field profiles-nya benar-benar terisi.
    const { data, error } = await supabase.rpc("get_home_jobs", { p_tipe: tipe, p_limit: 150 });
    // PENTING: jangan telan error di sini. Kalau query gagal (mis. env var
    // Supabase belum ke-set saat deploy baru, RLS berubah, koneksi putus
    // sesaat) dan kita cuma fallback ke `data ?? []`, unstable_cache akan
    // menyimpan hasil KOSONG itu sebagai cache selama 1800 detik -- beranda
    // jadi kelihatan "tidak ada postingan" padahal datanya ada, sampai cache
    // itu kedaluwarsa sendiri. Dengan throw, unstable_cache tidak akan
    // menyimpan hasil gagal ini, jadi request berikutnya akan coba query
    // lagi (dan begitu berhasil, baru di-cache).
    if (error) throw error;
    const rows = (kategori ? (data ?? []).filter((j: any) => j.category === kategori) : data) ?? [];
    const ranked = sortByPopularity(rows);
    const deduped = dedupeByOwnerAndTitle(ranked, (job) => job.employer_id);
    return deduped.slice(0, 100);
  },
  ["home-jobs"],
  { revalidate: 1800, tags: ["jobs-list"] }
);

// Listing marketplace digital aktif -- cache 30 menit (dinaikkan dari 15
// menit, alasan sama seperti getHomeJobs). Diambil sedikit lebih banyak lalu
// di-dedup per akun (nama produk/jasa sama atau mirip -> hanya 1 yang tampil).
// Pool hasil dinaikkan ke 100 (pagination.ts app/marketplace/page.tsx
// memotongnya 10 per halaman lewat ?page=).
export const getMarketplaceListings = unstable_cache(
  async (kategori?: string) => {
    const supabase = createPublicClient();
    // Lihat catatan bugfix 0068 di getHomeJobs di atas -- alasan yang sama
    // persis berlaku di sini (seller/rating tidak pernah tampil di grid
    // marketplace publik tanpa RPC ini).
    const { data, error } = await supabase.rpc("get_marketplace_listings", { p_limit: 150 });
    // Sama seperti getHomeJobs -- jangan cache hasil kosong yang sebenarnya
    // berasal dari error, bukan dari memang belum ada listing.
    if (error) throw error;
    const rows = (kategori ? (data ?? []).filter((l: any) => l.category === kategori) : data) ?? [];
    const ranked = sortByPopularity(rows);
    const deduped = dedupeByOwnerAndTitle(ranked, (item) => item.seller_id);
    return deduped.slice(0, 100);
  },
  ["marketplace-listings"],
  { revalidate: 1800, tags: ["marketplace-list"] }
);

// Pencarian listing marketplace berdasarkan judul -- SENGAJA tidak di-cache
// lewat unstable_cache (beda dari getMarketplaceListings di atas) karena
// kata kunci pencarian jumlahnya sangat bervariasi, jadi tidak efektif
// untuk di-cache per kombinasi kata kunci. Dipanggil langsung dari halaman
// /marketplace ketika user mengisi kotak pencarian.
export async function searchMarketplaceListings(q: string, kategori?: string) {
  const supabase = createPublicClient();
  // Lihat catatan bugfix 0068 di getHomeJobs -- alasan yang sama persis berlaku di sini.
  const { data, error } = await supabase.rpc("get_marketplace_listings", { p_search: q.trim(), p_limit: 100 });
  if (error) throw error;
  const rows = kategori ? (data ?? []).filter((l: any) => l.category === kategori) : data;
  return rows ?? [];
}

// Banner promosi aktif -- cache 24 jam.
export const getActiveBanners = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("banners")
      .select("id, title, image_url, link_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return data ?? [];
  },
  ["active-banners"],
  { revalidate: 86400, tags: ["banners"] }
);

// Satu nilai platform_settings -- cache 24 jam.
export const getPlatformSetting = unstable_cache(
  async (key: string) => {
    const supabase = createPublicClient();
    const { data } = await supabase.from("platform_settings").select("value").eq("key", key).single();
    return data?.value ?? null;
  },
  ["platform-setting"],
  { revalidate: 86400, tags: ["settings"] }
);
