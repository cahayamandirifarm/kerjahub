"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RedirectForm() {
  const router = useRouter();
  const supabase = createClient();
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [statusCode, setStatusCode] = useState<"301" | "302">("301");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const from = fromPath.trim().startsWith("/") ? fromPath.trim() : `/${fromPath.trim()}`;
    if (!from || from === "/" || !toPath.trim()) {
      setError("Isi 'Dari Path' (diawali /) dan 'Ke Path' dengan benar.");
      return;
    }
    setLoading(true);
    const { error: insertError } = await supabase.from("seo_redirects").insert({
      from_path: from,
      to_path: toPath.trim(),
      status_code: Number(statusCode)
    });
    setLoading(false);
    if (insertError) {
      setError(insertError.code === "23505" ? `Redirect dari "${from}" sudah ada.` : insertError.message);
      return;
    }
    setFromPath("");
    setToPath("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Dari Path</label>
          <input className="input" required placeholder="/jasa-lama-bandung" value={fromPath} onChange={(e) => setFromPath(e.target.value)} />
        </div>
        <div>
          <label className="label">Ke Path / URL</label>
          <input className="input" required placeholder="/jasa-antar-jemput-bandung" value={toPath} onChange={(e) => setToPath(e.target.value)} />
        </div>
        <div>
          <label className="label">Tipe</label>
          <select className="input" value={statusCode} onChange={(e) => setStatusCode(e.target.value as "301" | "302")}>
            <option value="301">301 (Permanen)</option>
            <option value="302">302 (Sementara)</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Menyimpan..." : "Tambah Redirect"}
      </button>
    </form>
  );
}
