import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

// Query publik yang di-cache di sisi server (Next.js Data Cache / Vercel).
// Dipakai di server component yang TIDAK butuh cookies/auth (halaman
// beranda & marketplace), supaya route-nya bisa ikut di-cache (ISR) dan
// tidak query Supabase di setiap kunjungan.
//
// JANGAN tambahkan query di sini untuk data yang personal/sensitif (saldo,
// escrow, transaksi, chat, notifikasi, dsb) -- itu wajib selalu fresh per
// pengguna dan tidak boleh di-cache lintas pengguna.

// Postingan kerja terbuka di beranda -- cache 15 menit.
export const getHomeJobs = unstable_cache(
  async (tipe: "employer" | "worker", kategori?: string) => {
    const supabase = createPublicClient();
    let query = supabase
      .from("jobs")
      .select("*")
      .eq("stage", "terbuka")
      .eq("is_active", true)
      .eq("posted_by_role", tipe)
      .order("created_at", { ascending: false })
      .limit(30);
    if (kategori) query = query.eq("category", kategori);
    const { data } = await query;
    return data ?? [];
  },
  ["home-jobs"],
  { revalidate: 900, tags: ["jobs-list"] }
);

// Listing marketplace digital aktif -- cache 15 menit.
export const getMarketplaceListings = unstable_cache(
  async (kategori?: string) => {
    const supabase = createPublicClient();
    let query = supabase.from("digital_listings").select("*").eq("status", "aktif").order("created_at", { ascending: false });
    if (kategori) query = query.eq("category", kategori);
    const { data } = await query;
    return data ?? [];
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
