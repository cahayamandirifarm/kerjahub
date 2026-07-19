"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DIGITAL_CATEGORIES } from "@/lib/types";

export default function PostDigitalListingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ category: DIGITAL_CATEGORIES[0].value, title: "", description: "", price: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 5) {
      setError("Maksimal 5 foto.");
      return;
    }
    setError(null);
    setFiles(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (files.length < 1) {
      setError("Wajib unggah minimal 1 foto produk.");
      return;
    }

    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/marketplace/post");
      return;
    }

    const uploadedUrls: string[] = [];
    for (const file of files) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("digital-listings").upload(path, file);
      if (uploadError) continue;
      const { data } = supabase.storage.from("digital-listings").getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }

    if (uploadedUrls.length === 0) {
      setLoading(false);
      setError("Gagal mengunggah foto, coba lagi.");
      return;
    }

    const { error: insertError } = await supabase.from("digital_listings").insert({
      seller_id: user.id,
      category: form.category,
      title: form.title,
      description: form.description,
      price: Number(form.price),
      cover_image: uploadedUrls[0],
      gallery_images: uploadedUrls.slice(1)
    });

    setLoading(false);
    if (insertError) {
      setError("Gagal memposting produk.");
      return;
    }
    router.push("/marketplace");
  }

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Jual Produk Digital</h1>
        <p className="text-sm text-ink/60 mb-6">Wajib unggah minimal 1 foto, maksimal 5 foto produk.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Kategori</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {DIGITAL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Judul Produk</label>
            <input
              className="input"
              required
              placeholder="Contoh: Akun Mobile Legends Mythic Full Skin"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Deskripsi</label>
            <textarea
              className="input min-h-[100px]"
              required
              placeholder="Jelaskan detail produk, spesifikasi, cara serah terima, dll"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Harga (Rp)</label>
            <input
              className="input"
              type="number"
              min={5000}
              required
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Foto Produk (1-5 foto)</label>
            <input className="input" type="file" accept="image/*" multiple onChange={handleFiles} />
            {files.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mt-2">
                {files.map((f, i) => (
                  <img key={i} src={URL.createObjectURL(f)} alt="" className="aspect-square object-cover rounded-lg border border-line" />
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Memposting..." : "Posting Produk"}
          </button>
        </form>
      </div>
    </div>
  );
}
