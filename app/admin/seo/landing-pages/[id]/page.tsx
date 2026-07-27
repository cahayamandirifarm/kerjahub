import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPageForm from "../LandingPageForm";

export default async function EditSeoLandingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: lp }, { data: faqs }, { data: categories }, { data: locations }, { data: relatedOptions }] = await Promise.all([
    supabase.from("seo_landing_pages").select("*").eq("id", params.id).single(),
    supabase.from("seo_faqs").select("*").eq("landing_page_id", params.id).order("sort_order"),
    supabase.from("seo_categories").select("id, name").order("name"),
    supabase.from("seo_locations").select("id, name").order("name"),
    supabase.from("seo_landing_pages").select("id, title").order("title")
  ]);

  if (!lp) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Edit Landing Page</h1>
      <LandingPageForm
        initial={lp as any}
        initialFaqs={faqs || []}
        categories={categories || []}
        locations={locations || []}
        relatedOptions={relatedOptions || []}
      />
    </div>
  );
}
