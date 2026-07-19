"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { JOB_CATEGORIES } from "@/lib/types";

export default function PostJobPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    category: JOB_CATEGORIES[0],
    description: "",
    location: "",
    is_remote: false,
    price: "",
    estimated_duration: ""
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => setLocLoading(false),
      { enableHighAccuracy: true }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/dashboard/employer/post-job");
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from("jobs").insert({
      employer_id: user.id,
      posted_by_role: "employer",
      title: form.title,
      category: form.category,
      description: form.description,
      location: form.is_remote ? "Remote" : form.location,
      is_remote: form.is_remote,
      price: Number(form.price),
      estimated_duration: form.estimated_duration,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null
    });
    setLoading(false);

    if (insertError) {
      setError("Gagal memasang penawaran. Coba lagi.");
      return;
    }
    router.push("/dashboard/employer");
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Pasang Penawaran Kerja</h1>
      <p className="text-sm text-ink/60 mb-6">
        Isi detail pekerjaan selengkap mungkin agar pekerja yang tepat cepat menemukanmu.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Jenis Pekerjaan / Judul</label>
          <input
            className="input"
            required
            placeholder="Contoh: Butuh Tukang Kebun Akhir Pekan"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Kategori</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
          >
            {JOB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Deskripsi Pekerjaan</label>
          <textarea
            className="input min-h-[120px]"
            required
            placeholder="Jelaskan detail pekerjaan, kualifikasi, dan hal penting lainnya"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.is_remote}
            onChange={(e) => update("is_remote", e.target.checked)}
          />
          Pekerjaan ini bisa dikerjakan online / remote
        </label>

        {!form.is_remote && (
          <div>
            <label className="label">Lokasi</label>
            <input
              className="input"
              required={!form.is_remote}
              placeholder="Contoh: Jakarta Selatan"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
            <button
              type="button"
              onClick={useMyLocation}
              className="text-xs font-semibold text-turquoise mt-1.5"
            >
              {locLoading ? "Mengambil lokasi..." : coords ? "Lokasi GPS tersimpan ✓" : "Gunakan lokasi GPS saya saat ini"}
            </button>
            <p className="text-xs text-ink/40 mt-1">
              Lokasi GPS membantu pekerja di sekitar menemukan pekerjaan ini lewat fitur "Terdekat".
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tarif Harga (Rp)</label>
            <input
              className="input"
              type="number"
              min={1000}
              required
              placeholder="150000"
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Estimasi Waktu</label>
            <input
              className="input"
              required
              placeholder="1 hari / 3 jam"
              value={form.estimated_duration}
              onChange={(e) => update("estimated_duration", e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Memasang..." : "Pasang Penawaran"}
        </button>
      </form>
    </div>
  );
}
