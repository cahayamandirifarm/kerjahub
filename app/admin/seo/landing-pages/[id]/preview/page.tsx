import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPageView from "@/components/seo/LandingPageView";

// Beda dari app/[slug]/page.tsx (publik, cuma baca yang status=published
// lewat client anon): halaman ini pakai client server yang terautentikasi
// sebagai admin (RLS "Admin kelola semua landing page" mengizinkan baca
// SEMUA status), jadi admin bisa preview draft SEBELUM di-publish.
export default async function AdminSeoLandingPagePreview({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: lp } = await supabase
    .from("seo_landing_pages")
    .select("*, category:seo_categories(id, name), location:seo_locations(id, name)")
    .eq("id", params.id)
    .single();

  if (!lp) notFound();

  const [{ data: faqs }, { data: related }] = await Promise.all([
    supabase.from("seo_faqs").select("*").eq("landing_page_id", lp.id).order("sort_order"),
    lp.related_ids?.length
      ? supabase.from("seo_landing_pages").select("id, title, slug, h1").in("id", lp.related_ids)
      : Promise.resolve({ data: [] })
  ]);

  return <LandingPageView lp={lp as any} faqs={faqs || []} related={related || []} previewBanner />;
}
