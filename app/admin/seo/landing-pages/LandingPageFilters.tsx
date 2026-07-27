"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export default function LandingPageFilters({
  categories,
  locations
}: {
  categories: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", q);
  }

  return (
    <div className="card p-4 mb-4 grid sm:grid-cols-5 gap-2">
      <form onSubmit={handleSearchSubmit} className="sm:col-span-2 relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          className="input pl-9"
          placeholder="Cari judul atau slug..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <select
        className="input"
        value={searchParams.get("status") || ""}
        onChange={(e) => updateParam("status", e.target.value)}
      >
        <option value="">Semua Status</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
      </select>
      <select
        className="input"
        value={searchParams.get("category") || ""}
        onChange={(e) => updateParam("category", e.target.value)}
      >
        <option value="">Semua Kategori</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        value={searchParams.get("location") || ""}
        onChange={(e) => updateParam("location", e.target.value)}
      >
        <option value="">Semua Daerah</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-ink/70 sm:col-span-5">
        <input
          type="checkbox"
          checked={searchParams.get("featured") === "1"}
          onChange={(e) => updateParam("featured", e.target.checked ? "1" : "")}
        />
        Hanya yang Featured
      </label>
    </div>
  );
}
