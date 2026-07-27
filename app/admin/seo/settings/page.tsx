import { createClient } from "@/lib/supabase/server";
import SeoSettingsForm from "./SeoSettingsForm";
import TaxonomyManager from "./TaxonomyManager";

export default async function AdminSeoSettingsPage() {
  const supabase = createClient();
  const [{ data: settings }, { data: categories }, { data: locations }] = await Promise.all([
    supabase.from("seo_settings").select("*").eq("id", 1).single(),
    supabase.from("seo_categories").select("*").order("name"),
    supabase.from("seo_locations").select("*").order("name")
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">SEO — Pengaturan</h1>
      <p className="text-sm text-ink/60 mb-6">Nilai default yang dipakai landing page mana pun yang tidak mengisi field-nya sendiri.</p>
      <SeoSettingsForm initial={settings || null} />

      <h2 className="font-display text-lg font-semibold mt-8 mb-1">Kategori & Daerah</h2>
      <p className="text-sm text-ink/60 mb-4">Dipakai sebagai pilihan Kategori/Daerah saat membuat landing page.</p>
      <TaxonomyManager initialCategories={categories || []} initialLocations={locations || []} />
    </div>
  );
}
