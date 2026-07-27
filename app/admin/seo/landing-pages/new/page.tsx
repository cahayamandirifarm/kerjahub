import { createClient } from "@/lib/supabase/server";
import LandingPageForm from "../LandingPageForm";

export default async function NewSeoLandingPage() {
  const supabase = createClient();
  const [{ data: categories }, { data: locations }, { data: relatedOptions }] = await Promise.all([
    supabase.from("seo_categories").select("id, name").order("name"),
    supabase.from("seo_locations").select("id, name").order("name"),
    supabase.from("seo_landing_pages").select("id, title").order("title")
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Landing Page Baru</h1>
      <LandingPageForm
        categories={categories || []}
        locations={locations || []}
        relatedOptions={relatedOptions || []}
      />
    </div>
  );
}
