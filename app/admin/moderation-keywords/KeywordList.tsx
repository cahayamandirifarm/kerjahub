"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";

interface Keyword {
  id: string;
  keyword: string;
  category: "dating_dewasa" | "scam" | "curhat_teman";
  is_active: boolean;
  created_at: string;
}

const CATEGORY_LABEL: Record<Keyword["category"], string> = {
  dating_dewasa: "Kencan / Layanan Dewasa",
  scam: "Penipuan / Scam",
  curhat_teman: "Curhat / Teman / Menemani"
};

export default function KeywordList({ initialKeywords }: { initialKeywords: Keyword[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [keywords, setKeywords] = useState(initialKeywords);

  async function toggleActive(id: string, current: boolean) {
    setKeywords((list) => list.map((k) => (k.id === id ? { ...k, is_active: !current } : k)));
    await supabase.from("moderation_keywords").update({ is_active: !current }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus kata kunci ini dari filter?")) return;
    setKeywords((list) => list.filter((k) => k.id !== id));
    await supabase.from("moderation_keywords").delete().eq("id", id);
    router.refresh();
  }

  const grouped = (["dating_dewasa", "scam", "curhat_teman"] as const).map((cat) => ({
    cat,
    items: keywords.filter((k) => k.category === cat)
  }));

  if (keywords.length === 0) {
    return <div className="card p-6 text-center text-ink/50 text-sm">Belum ada kata kunci di daftar filter.</div>;
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ cat, items }) =>
        items.length === 0 ? null : (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">{CATEGORY_LABEL[cat]}</h3>
            <div className="flex flex-wrap gap-2">
              {items.map((k) => (
                <div
                  key={k.id}
                  className={`flex items-center gap-2 rounded-full pl-3 pr-1.5 py-1 text-sm border ${
                    k.is_active ? "border-turquoise/40 bg-turquoise-light/40" : "border-line bg-white opacity-50"
                  }`}
                >
                  <button
                    onClick={() => toggleActive(k.id, k.is_active)}
                    className="font-medium"
                    title={k.is_active ? "Aktif -- klik untuk nonaktifkan" : "Nonaktif -- klik untuk aktifkan"}
                  >
                    {k.keyword}
                  </button>
                  <button onClick={() => remove(k.id)} className="text-clay p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
