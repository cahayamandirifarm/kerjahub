"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BannerForm() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Pilih gambar banner dulu.");
      return;
    }
    setLoading(true);
    const path = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("banners").upload(path, file);
    if (uploadError) {
      setLoading(false);
      setError("Gagal unggah gambar.");
      return;
    }
    const { data: urlData } = supabase.storage.from("banners").getPublicUrl(path);

    const { count } = await supabase.from("banners").select("*", { count: "exact", head: true });

    await supabase.from("banners").insert({
      title,
      image_url: urlData.publicUrl,
      link_url: linkUrl || null,
      sort_order: count || 0
    });

    setLoading(false);
    setTitle("");
    setLinkUrl("");
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-6">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Judul Banner</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Link Tujuan (opsional)</label>
          <input className="input" placeholder="/marketplace" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Gambar Banner</label>
        <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Mengunggah..." : "Tambah Banner"}
      </button>
    </form>
  );
}
