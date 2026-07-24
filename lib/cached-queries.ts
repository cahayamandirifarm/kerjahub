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

// Postingan kerja terbuka di beranda -- cache 15 menit.
// Ambil lebih banyak baris dari yang akan ditampilkan (limit 60) karena
// setelah di-dedup per akun (judul sama/mirip disisakan 1) jumlahnya bisa
// berkurang -- lalu dipotong ke 30 hasil akhir.
export const getHomeJobs = unstable_cache(
  async (tipe: "employer" | "worker", kategori?: string) => {
    const supabase = createPublicClient();
    let query = supabase
      .from("jobs")
      .select("*, profiles!jobs_employer_id_fkey(id, full_name, avatar_url, rating_avg, rating_count, completed_jobs_count)")
      .eq("stage", "terbuka")
      .eq("is_active", true)
      .eq("posted_by_role", tipe)
      .order("created_at", { ascending: false })
      .limit(60);
    if (kategori) query = query.eq("category", kategori);
    const { data } = await query;
    const ranked = sortByPopularity(data ?? []);
    const deduped = dedupeByOwnerAndTitle(ranked, (job) => job.employer_id);
    return deduped.slice(0, 30);
  },
  ["home-jobs"],
  { revalidate: 900, tags: ["jobs-list"] }
);

// Listing marketplace digital aktif -- cache 15 menit. Sama seperti
// getHomeJobs: diambil lebih banyak lalu di-dedup per akun (nama
// produk/jasa sama atau mirip -> hanya 1 yang tampil).
export const getMarketplaceListings = unstable_cache(
  async (kategori?: string) => {
    const supabase = createPublicClient();
    let query = supabase
      .from("digital_listings")
      .select("*, profiles!digital_listings_seller_id_fkey(id, full_name, avatar_url, rating_avg, rating_count, completed_jobs_count)")
      .eq("status", "aktif")
      .order("created_at", { ascending: false })
      .limit(80);
    if (kategori) query = query.eq("category", kategori);
    const { data } = await query;
    const ranked = sortByPopularity(data ?? []);
    const deduped = dedupeByOwnerAndTitle(ranked, (item) => item.seller_id);
    return deduped.slice(0, 40);
  },
  ["marketplace-listings"],
  { revalidate: 900, tags: ["marketplace-list"] }
);

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
