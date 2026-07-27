import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSeoSitemapPage() {
  const supabase = createClient();
  const [{ count: publishedCount }, { count: draftCount }, { data: recent }] = await Promise.all([
    supabase.from("seo_landing_pages").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("seo_landing_pages").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("seo_landing_pages").select("title, slug, updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(10)
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">SEO — Sitemap</h1>
      <p className="text-sm text-ink/60 mb-6">
        <code>sitemap.xml</code> dan <code>robots.txt</code> dibuat otomatis (Next.js <code>app/sitemap.ts</code> &amp;{" "}
        <code>app/robots.ts</code>) -- landing page yang di-publish langsung ikut masuk, tidak perlu aksi manual di sini.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs text-ink/40">Landing Page Published (masuk sitemap)</p>
          <p className="font-display text-3xl font-bold text-ink mt-1">{publishedCount ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-ink/40">Draft (belum masuk sitemap)</p>
          <p className="font-display text-3xl font-bold text-ink mt-1">{draftCount ?? 0}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Link href="/sitemap.xml" target="_blank" className="btn-secondary text-sm inline-flex items-center gap-1.5">
          <ExternalLink size={15} /> Lihat sitemap.xml
        </Link>
        <Link href="/robots.txt" target="_blank" className="btn-secondary text-sm inline-flex items-center gap-1.5">
          <ExternalLink size={15} /> Lihat robots.txt
        </Link>
      </div>

      <h2 className="font-display text-lg font-semibold mb-2">Baru diperbarui</h2>
      <div className="card divide-y divide-line">
        {(recent || []).map((r) => (
          <div key={r.slug} className="px-4 py-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-ink">{r.title}</p>
              <p className="text-xs text-ink/40">/{r.slug}</p>
            </div>
            <span className="text-xs text-ink/40">
              {new Date(r.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        ))}
        {!recent?.length && <p className="px-4 py-6 text-center text-sm text-ink/40">Belum ada landing page yang di-publish.</p>}
      </div>
    </div>
  );
}
