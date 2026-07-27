import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl } from "@/lib/seo-helpers";

// Next.js otomatis serve ini di /sitemap.xml. Landing page baru langsung
// masuk begitu revalidate berikutnya jalan (lihat `revalidate` di bawah) --
// tidak perlu build/deploy ulang.
export const revalidate = 3600;

const STATIC_ROUTES = ["/", "/marketplace", "/lowongan-pekerja-terdekat", "/kategori"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();
  const [{ data: landingPages }, { data: listings }] = await Promise.all([
    supabase
      .from("seo_landing_pages")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(50000), // batas wajar per sitemap.xml -- kalau nanti tembus, tinggal dipecah jadi sitemap index
    supabase
      .from("digital_listings")
      .select("id, created_at")
      .eq("status", "aktif")
      .order("created_at", { ascending: false })
      .limit(50000)
  ]);

  const landingEntries: MetadataRoute.Sitemap = (landingPages || []).map((row) => ({
    url: absoluteUrl(`/${row.slug}`),
    lastModified: row.updated_at,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  const listingEntries: MetadataRoute.Sitemap = (listings || []).map((row) => ({
    url: absoluteUrl(`/marketplace/${row.id}`),
    lastModified: row.created_at,
    changeFrequency: "weekly",
    priority: 0.5
  }));

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: "daily",
    priority: path === "/" ? 1 : 0.6
  }));

  return [...staticEntries, ...landingEntries, ...listingEntries];
}
