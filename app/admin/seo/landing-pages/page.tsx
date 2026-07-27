import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import LandingPageFilters from "./LandingPageFilters";
import LandingPageList from "./LandingPageList";

export default async function AdminSeoLandingPagesPage({
  searchParams
}: {
  searchParams: { q?: string; status?: string; category?: string; location?: string; featured?: string };
}) {
  const supabase = createClient();

  let query = supabase
    .from("seo_landing_pages")
    .select("id, title, slug, status, featured, publish_date, updated_at, category:seo_categories(name), location:seo_locations(name)")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (searchParams.q?.trim()) {
    query = query.or(`title.ilike.%${searchParams.q.trim()}%,slug.ilike.%${searchParams.q.trim()}%`);
  }
  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.category) query = query.eq("category_id", searchParams.category);
  if (searchParams.location) query = query.eq("location_id", searchParams.location);
  if (searchParams.featured === "1") query = query.eq("featured", true);

  const [{ data: pages }, { data: categories }, { data: locations }] = await Promise.all([
    query,
    supabase.from("seo_categories").select("id, name").order("name"),
    supabase.from("seo_locations").select("id, name").order("name")
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-semibold">SEO — Landing Pages</h1>
        <Link href="/admin/seo/landing-pages/new" className="btn-primary !py-2 text-sm">
          <Plus size={16} /> Landing Page Baru
        </Link>
      </div>
      <p className="text-sm text-ink/60 mb-6">
        Kelola halaman SEO custom (mis. <code>/jasa-antar-jemput-bandung</code>) yang bisa diindex Google.
      </p>

      <LandingPageFilters categories={categories || []} locations={locations || []} />
      <LandingPageList initialPages={(pages as any) || []} />
    </div>
  );
}
