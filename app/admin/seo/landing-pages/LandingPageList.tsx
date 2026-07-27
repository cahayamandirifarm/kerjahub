"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Trash2, ExternalLink, Star } from "lucide-react";

interface Row {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  featured: boolean;
  publish_date: string | null;
  updated_at: string;
  category: { name: string } | null;
  location: { name: string } | null;
}

export default function LandingPageList({ initialPages }: { initialPages: Row[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [pages, setPages] = useState(initialPages);

  async function toggleStatus(row: Row) {
    const next = row.status === "published" ? "draft" : "published";
    setPages((list) => list.map((p) => (p.id === row.id ? { ...p, status: next } : p)));
    await supabase.from("seo_landing_pages").update({ status: next }).eq("id", row.id);
    router.refresh();
  }

  async function toggleFeatured(row: Row) {
    setPages((list) => list.map((p) => (p.id === row.id ? { ...p, featured: !p.featured } : p)));
    await supabase.from("seo_landing_pages").update({ featured: !row.featured }).eq("id", row.id);
    router.refresh();
  }

  async function remove(row: Row) {
    if (!confirm(`Hapus landing page "${row.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setPages((list) => list.filter((p) => p.id !== row.id));
    await supabase.from("seo_landing_pages").delete().eq("id", row.id);
    router.refresh();
  }

  if (!pages.length) {
    return <div className="card p-8 text-center text-sm text-ink/50">Belum ada landing page. Klik "Landing Page Baru" untuk mulai.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/40 border-b border-line">
            <th className="px-4 py-3 font-medium">Judul & Slug</th>
            <th className="px-4 py-3 font-medium">Kategori / Daerah</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Diperbarui</th>
            <th className="px-4 py-3 font-medium text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-ink">{p.title}</p>
                  {p.featured && <Star size={13} className="text-gold fill-gold" />}
                </div>
                <p className="text-xs text-ink/40">/{p.slug}</p>
              </td>
              <td className="px-4 py-3 text-xs text-ink/60">
                {p.category?.name || "—"} {p.location?.name ? `· ${p.location.name}` : ""}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleStatus(p)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    p.status === "published" ? "bg-turquoise-light text-turquoise-dark" : "bg-ink/5 text-ink/50"
                  }`}
                >
                  {p.status === "published" ? "Published" : "Draft"}
                </button>
              </td>
              <td className="px-4 py-3 text-xs text-ink/40">
                {new Date(p.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => toggleFeatured(p)}
                    title="Featured"
                    className="p-1.5 rounded-md text-ink/40 hover:bg-ink/5 hover:text-gold-dark"
                  >
                    <Star size={15} className={p.featured ? "fill-gold text-gold" : ""} />
                  </button>
                  {p.status === "published" && (
                    <Link href={`/${p.slug}`} target="_blank" title="Lihat halaman" className="p-1.5 rounded-md text-ink/40 hover:bg-ink/5">
                      <ExternalLink size={15} />
                    </Link>
                  )}
                  <Link href={`/admin/seo/landing-pages/${p.id}`} title="Edit" className="p-1.5 rounded-md text-ink/40 hover:bg-ink/5">
                    <Pencil size={15} />
                  </Link>
                  <button onClick={() => remove(p)} title="Hapus" className="p-1.5 rounded-md text-clay/70 hover:bg-clay/10 hover:text-clay">
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
