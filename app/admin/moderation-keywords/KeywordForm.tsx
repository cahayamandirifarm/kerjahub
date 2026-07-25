"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";

const CATEGORIES = [
  { value: "dating_dewasa", label: "Kencan / Layanan Dewasa" },
  { value: "scam", label: "Penipuan / Scam" },
  { value: "curhat_teman", label: "Curhat / Teman / Menemani" }
];

export default function KeywordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("dating_dewasa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("moderation_keywords")
      .insert({ keyword: keyword.trim().toLowerCase(), category });
    setLoading(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "Kata kunci ini sudah ada di daftar." : "Gagal menambahkan kata kunci.");
      return;
    }
    setKeyword("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 mb-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label className="label">Kata / Frasa Baru</label>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Contoh: booking online"
          className="input"
        />
      </div>
      <div>
        <label className="label">Kategori</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={loading} className="btn-primary !px-4 !py-2.5 text-sm gap-1">
        <Plus size={16} /> {loading ? "Menambah..." : "Tambah Kata Kunci"}
      </button>
      {error && <p className="text-sm text-clay w-full">{error}</p>}
    </form>
  );
}
