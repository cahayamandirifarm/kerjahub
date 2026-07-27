import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { resolveMetaDescription, resolveMetaTitle, buildAutoSchema, absoluteUrl } from "@/lib/seo-helpers";
import type { SeoLandingPage, SeoFaq, SeoSettings } from "@/lib/seo-types";
import JsonLd from "@/components/seo/JsonLd";
import LandingPageView from "@/components/seo/LandingPageView";

// ISR: halaman di-generate ulang di background paling cepat tiap 1 jam --
// perubahan admin tidak butuh redeploy, cukup tunggu revalidate berikutnya
// (atau pakai draft mode/preview untuk lihat instan, lihat halaman admin).
export const revalidate = 3600;

// CATATAN NEXT.JS VERSION: project ini pakai Next.js 14.2.15 (lihat
// package.json), BUKAN 15 -- di 14, `params` masih object biasa (BUKAN
// Promise seperti di Next 15 App Router), jadi TIDAK di-`await` di sini.
// Kalau project ini nanti di-upgrade ke Next 15, baris `{ params }` di
// bawah perlu diubah jadi `async ({ params }) => { const { slug } = await
// params; ... }`.
type Params = { params: { slug: string } };

async function getSettings(): Promise<SeoSettings | null> {
  const supabase = createPublicClient();
  const { data } = await supabase.from("seo_settings").select("*").eq("id", 1).single();
  return data as SeoSettings | null;
}

async function getLandingPage(slug: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_landing_pages")
    .select(
      "*, category:seo_categories(id, name, slug, job_category_match, keyword_match, remote_service), location:seo_locations(id, name, slug)"
    )
    .eq("slug", slug)
    .single();
  return data as (SeoLandingPage & { category: any; location: any }) | null;
}

async function getFaqs(landingPageId: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_faqs")
    .select("*")
    .eq("landing_page_id", landingPageId)
    .order("sort_order", { ascending: true });
  return (data as SeoFaq[]) || [];
}

async function getRelated(ids: string[]) {
  if (!ids.length) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_landing_pages")
    .select("id, title, slug, h1")
    .in("id", ids)
    .eq("status", "published");
  return (data as Pick<SeoLandingPage, "id" | "title" | "slug" | "h1">[]) || [];
}

// Postingan JASA (tabel jobs, bukan marketplace/digital_listings) yang
// otomatis cocok dengan kategori SEO landing page ini -- dicocokkan lewat
// job_category_match (kategori persis) ATAU keyword_match (judul ILIKE),
// dan kalau landing page ini punya kota, prioritaskan job yang location-nya
// (teks bebas) menyebut kota itu; kalau layanan ini remote_service, cukup
// filter is_remote = true tanpa peduli kota.
async function getRelatedJobs(category: any, location: any) {
  if (!category) return [];
  const categoryMatch: string[] = category.job_category_match || [];
  const keywordMatch: string[] = category.keyword_match || [];
  if (!categoryMatch.length && !keywordMatch.length) return [];

  const supabase = createPublicClient();
  // RPC security-definer (lihat migration 0087) -- WAJIB, bukan query tabel
  // langsung: query langsung lewat client anon bikin embed profiles selalu
  // null buat pengunjung yang belum login (RLS profiles = authenticated
  // only), persis bug "foto profil tidak muncul" yang sudah kita perbaiki
  // sebelumnya di migration 0086.
  const { data } = await supabase.rpc("get_seo_related_jobs", {
    p_category_match: categoryMatch,
    p_keyword_match: keywordMatch,
    p_location_name: location?.name || null,
    p_remote: !!category.remote_service,
    p_limit: 6
  });
  return (data as any[]) || [];
}

// "Lihat juga" -- kategori lain yang berhubungan (diseed lewat
// seo_category_relations di migration 0087), tautkan ke halaman generic
// (tanpa kota) kategori itu.
async function getRelatedCategories(categoryId: string | null) {
  if (!categoryId) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_category_relations")
    .select("related:seo_categories!seo_category_relations_related_category_id_fkey(id, name, slug)")
    .eq("category_id", categoryId)
    .limit(6);
  return (data || []).map((r: any) => r.related).filter(Boolean);
}

// Kota lain yang punya landing page untuk kategori yang sama (buat
// "Related Cities" -- mis. dari halaman Bandung, tampilkan Jakarta,
// Surabaya, dst untuk layanan yang sama).
async function getSiblingCityPages(categoryId: string | null, currentSlug: string) {
  if (!categoryId) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_landing_pages")
    .select("slug, h1, location:seo_locations(name)")
    .eq("category_id", categoryId)
    .eq("status", "published")
    .not("location_id", "is", null)
    .neq("slug", currentSlug)
    .limit(8);
  return data || [];
}

// Halaman publik yang paling sering dikunjungi di-generate statis di build
// time (SSR penuh, bukan CSR) -- sisanya tetap kebentuk on-demand lewat ISR
// begitu pertama kali diakses, jadi tidak perlu nunggu build ulang buat
// ribuan landing page yang baru dibuat admin belakangan.
export async function generateStaticParams() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("seo_landing_pages")
    .select("slug")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data || []).map((row) => ({ slug: row.slug as string }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [lp, settings] = await Promise.all([getLandingPage(params.slug), getSettings()]);
  if (!lp) return { title: "Halaman tidak ditemukan" };

  const title = resolveMetaTitle(lp, settings);
  const description = resolveMetaDescription(lp, settings);
  const canonical = lp.canonical_url?.trim() || absoluteUrl(`/${lp.slug}`);
  const ogImage = lp.og_image || settings?.default_og_image || undefined;

  return {
    title,
    description,
    keywords: lp.meta_keywords || undefined,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: settings?.site_name || "KerjaHub",
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
      locale: "id_ID"
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined
    }
  };
}

export default async function SeoLandingPage({ params }: Params) {
  const lp = await getLandingPage(params.slug);

  if (!lp) {
    // Bukan landing page aktif -- coba cek apakah ini slug lama yang
    // sengaja dialihkan admin lewat menu Redirect sebelum nyerah ke 404.
    const supabase = createPublicClient();
    const { data: redirectRow } = await supabase
      .from("seo_redirects")
      .select("to_path, status_code")
      .eq("from_path", `/${params.slug}`)
      .maybeSingle();

    if (redirectRow) {
      redirect(redirectRow.to_path);
    }
    notFound();
  }

  const [faqs, settings, related, relatedJobs, relatedCategories, siblingCities] = await Promise.all([
    getFaqs(lp.id),
    getSettings(),
    getRelated(lp.related_ids || []),
    getRelatedJobs(lp.category, lp.location),
    getRelatedCategories(lp.category?.id || null),
    getSiblingCityPages(lp.category?.id || null, lp.slug)
  ]);

  const schema = lp.schema_json && Object.keys(lp.schema_json).length > 0 ? lp.schema_json : buildAutoSchema(lp, faqs, settings);

  return (
    <>
      <JsonLd data={schema} />
      <LandingPageView
        lp={lp}
        faqs={faqs}
        related={related}
        relatedJobs={relatedJobs}
        relatedCategories={relatedCategories}
        siblingCities={siblingCities}
      />
    </>
  );
}
