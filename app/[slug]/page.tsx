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
    .select("*, category:seo_categories(id, name, slug), location:seo_locations(id, name, slug)")
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

  const [faqs, settings, related] = await Promise.all([
    getFaqs(lp.id),
    getSettings(),
    getRelated(lp.related_ids || [])
  ]);

  const schema = lp.schema_json && Object.keys(lp.schema_json).length > 0 ? lp.schema_json : buildAutoSchema(lp, faqs, settings);

  return (
    <>
      <JsonLd data={schema} />
      <LandingPageView lp={lp} faqs={faqs} related={related} />
    </>
  );
}
