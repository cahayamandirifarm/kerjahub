"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DIGITAL_CATEGORIES } from "@/lib/types";

type InitialListing = {
  category: string;
  title: string;
  description: string;
  price: number;
  cover_image: string;
  gallery_images: string[];
};

type Props = {
  listingId?: string;
  initial?: InitialListing;
};

export default function ListingForm({ listingId, initial }: Props) {
  const isEdit = !!listingId;
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    category: initial?.category ?? DIGITAL_CATEGORIES[0].value,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial ? String(initial.price) : ""
  });
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingImages = [initial?.cover_image, ...(initial?.gallery_images ?? [])].filter(Boolean) as string[];

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

    if (!isEdit && files.length < 1) {
      setError("Wajib unggah minimal 1 foto produk.");
      return;
    }

    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?next=${isEdit ? `/marketplace/${listingId}/edit` : "/marketplace/post"}`);
      return;
    }

    let coverImage = initial?.cover_image ?? "";
    let galleryImages = initial?.gallery_images ?? [];

    if (files.length > 0) {
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
      coverImage = uploadedUrls[0];
      galleryImages = uploadedUrls.slice(1);
    }

    const payload = {
      category: form.category,
      title: form.title,
      description: form.description,
      price: Number(form.price),
      cover_image: coverImage,
      gallery_images: galleryImages
    };

    if (isEdit) {
      const { error: updateError } = await supabase.from("digital_listings").update(payload).eq("id", listingId).eq("seller_id", user.id);
      setLoading(false);
      if (updateError) {
        setError("Gagal menyimpan perubahan.");
        return;
      }
      router.push(`/marketplace/${listingId}`);
      router.refresh();
    } else {
      const { error: insertError } = await supabase.from("digital_listings").insert({ seller_id: user.id, ...payload });
      setLoading(false);
      if (insertError) {
        setError("Gagal memposting produk.");
        return;
      }
      router.push("/marketplace");
    }
  }

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">{isEdit ? "Edit Produk Digital" : "Jual Produk Digital"}</h1>
        <p className="text-sm text-ink/60 mb-6">
          {isEdit ? "Perbarui detail produkmu. Kosongkan unggah foto kalau tidak ingin menggantinya." : "Wajib unggah minimal 1 foto, maksimal 5 foto produk."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Kategori</label>
            <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
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
            {isEdit && existingImages.length > 0 && files.length === 0 && (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {existingImages.map((img, i) => (
                  <img key={i} src={img} alt="" className="aspect-square object-cover rounded-lg border border-line" />
                ))}
              </div>
            )}
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
            {loading ? (isEdit ? "Menyimpan..." : "Memposting...") : isEdit ? "Simpan Perubahan" : "Posting Produk"}
          </button>
        </form>
      </div>
    </div>
  );
}
