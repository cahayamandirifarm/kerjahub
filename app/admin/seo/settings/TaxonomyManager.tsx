"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/seo-helpers";
import { Plus, Trash2 } from "lucide-react";
import type { SeoCategory, SeoLocation } from "@/lib/seo-types";

function TaxonomyColumn({
  label,
  table,
  items,
  placeholder
}: {
  label: string;
  table: "seo_categories" | "seo_locations";
  items: (SeoCategory | SeoLocation)[];
  placeholder: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(items);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!name.trim()) return;
    const { data, error: insertError } = await supabase
      .from(table)
      .insert({ name: name.trim(), slug: slugify(name) })
      .select("id, name, slug")
      .single();
    if (insertError) {
      setError(insertError.code === "23505" ? "Nama/slug sudah dipakai." : insertError.message);
      return;
    }
    setRows((r) => [...r, data as any].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(`Hapus "${label}" ini? Landing page yang memakainya akan kehilangan tag ini (tidak terhapus).`)) return;
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from(table).delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-sm text-ink mb-2">{label}</h3>
      <div className="flex gap-1.5 mb-3">
        <input
          className="input !py-1.5 text-sm"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <button type="button" onClick={add} className="btn-secondary !py-1.5 !px-2.5">
          <Plus size={15} />
        </button>
      </div>
      {error && <p className="text-xs text-clay mb-2">{error}</p>}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-lg hover:bg-ink/5">
            <span>{r.name}</span>
            <button onClick={() => remove(r.id)} className="text-clay/50 hover:text-clay">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!rows.length && <p className="text-xs text-ink/40 px-2">Belum ada.</p>}
      </div>
    </div>
  );
}

export default function TaxonomyManager({
  initialCategories,
  initialLocations
}: {
  initialCategories: SeoCategory[];
  initialLocations: SeoLocation[];
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <TaxonomyColumn label="Kategori" table="seo_categories" items={initialCategories} placeholder="mis. Jasa Antar Jemput" />
      <TaxonomyColumn label="Daerah" table="seo_locations" items={initialLocations} placeholder="mis. Bandung" />
    </div>
  );
}
