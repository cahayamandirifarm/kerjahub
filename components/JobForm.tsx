"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { JOB_CATEGORIES } from "@/lib/types";
import { revalidateListings } from "@/lib/revalidate-listings";

type Role = "employer" | "worker";

type InitialJob = {
  title: string;
  category: string;
  description: string;
  location: string;
  is_remote: boolean;
  price: number;
  is_nego: boolean;
  estimated_duration: string;
};

type Props = {
  role: Role;
  /** Diisi hanya saat mode edit — id job yang sedang diubah. */
  jobId?: string;
  /** Diisi hanya saat mode edit — data job saat ini untuk mengisi form. */
  initial?: InitialJob;
};

const COPY: Record<Role, {
  titleLabel: string;
  titlePlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  locLabel: string;
  locHelp: string;
  priceLabel: string;
  priceNegoLabel: string;
  priceNegoHelp: string;
  durLabel: string;
  durPlaceholder: string;
  headingCreate: string;
  headingEdit: string;
  subCreate: string;
  subEdit: string;
  submitCreate: string;
  redirect: string;
  failCreate: string;
  failEdit: string;
}> = {
  employer: {
    titleLabel: "Jenis Pekerjaan / Judul",
    titlePlaceholder: "Contoh: Butuh Tukang Kebun Akhir Pekan",
    descLabel: "Deskripsi Pekerjaan",
    descPlaceholder: "Jelaskan detail pekerjaan, kualifikasi, dan hal penting lainnya",
    locLabel: "Lokasi",
    locHelp: "Lokasi GPS membantu pekerja di sekitar menemukan pekerjaan ini lewat fitur \"Terdekat\".",
    priceLabel: "Tarif Harga (Rp)",
    priceNegoLabel: "Perkiraan Harga Awal (Rp)",
    priceNegoHelp: "Harga akhir ditentukan lewat nego di chat dengan pekerja yang tertarik, bukan harga ini.",
    durLabel: "Estimasi Waktu",
    durPlaceholder: "1 hari / 3 jam",
    headingCreate: "Saya Butuh Pekerja (Pemberi Upah)",
    headingEdit: "Edit Penawaran Kerja",
    subCreate: "Isi detail pekerjaan selengkap mungkin agar pekerja yang tepat cepat menemukanmu.",
    subEdit: "Perbarui detail penawaran kerjamu.",
    submitCreate: "Pasang Penawaran",
    redirect: "/dashboard/employer",
    failCreate: "Gagal memasang penawaran. Coba lagi.",
    failEdit: "Gagal menyimpan perubahan. Coba lagi."
  },
  worker: {
    titleLabel: "Keahlian / Jasa yang Ditawarkan",
    titlePlaceholder: "Contoh: Jasa Bersih-bersih Rumah Harian",
    descLabel: "Deskripsi Keahlian & Pengalaman",
    descPlaceholder: "Jelaskan pengalaman, keahlian, dan hal penting lain yang membuatmu terpercaya",
    locLabel: "Area / Lokasi Kerja",
    locHelp: "Lokasi GPS membantu pemberi kerja di sekitar menemukanmu lewat fitur \"Terdekat\".",
    priceLabel: "Tarif yang Diminta (Rp)",
    priceNegoLabel: "Perkiraan Tarif Awal (Rp)",
    priceNegoHelp: "Harga akhir ditentukan lewat nego di chat dengan pemberi kerja yang tertarik, bukan harga ini.",
    durLabel: "Ketersediaan Waktu",
    durPlaceholder: "Setiap hari / Akhir pekan",
    headingCreate: "Saya Butuh Pekerjaan (Penerima Upah)",
    headingEdit: "Edit Mencari Kerja",
    subCreate: "Tawarkan keahlianmu ke pemberi kerja di sekitarmu. Isi selengkap mungkin supaya cepat dilirik.",
    subEdit: "Perbarui detail tawaran jasamu.",
    submitCreate: "Pasang Tawaran Jasa",
    redirect: "/dashboard/worker",
    failCreate: "Gagal memasang tawaran jasa. Coba lagi.",
    failEdit: "Gagal menyimpan perubahan. Coba lagi."
  }
};

export default function JobForm({ role, jobId, initial }: Props) {
  const isEdit = !!jobId;
  const c = COPY[role];
  const router = useRouter();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    category: initial?.category ?? JOB_CATEGORIES[0],
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    is_remote: initial?.is_remote ?? false,
    price: initial ? String(initial.price) : "",
    is_nego: initial?.is_nego ?? false,
    estimated_duration: initial?.estimated_duration ?? ""
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
      router.push(`/login?next=${isEdit ? `/dashboard/job/${jobId}/edit` : role === "employer" ? "/dashboard/employer/post-job" : "/dashboard/worker/post-listing"}`);
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      title: form.title,
      category: form.category,
      description: form.description,
      location: form.is_remote ? "Remote" : form.location,
      is_remote: form.is_remote,
      price: Number(form.price),
      is_nego: form.is_nego,
      estimated_duration: form.estimated_duration
    };
    if (coords) {
      payload.latitude = coords.lat;
      payload.longitude = coords.lng;
    }

    if (isEdit) {
      const { error: updateError } = await supabase.from("jobs").update(payload).eq("id", jobId).eq("employer_id", user.id);
      setLoading(false);
      if (updateError) {
        setError(c.failEdit);
        return;
      }
      revalidateListings();
      router.push(c.redirect);
      router.refresh();
    } else {
      const { error: insertError } = await supabase.from("jobs").insert({
        employer_id: user.id,
        posted_by_role: role,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        ...payload
      });
      setLoading(false);
      if (insertError) {
        setError(c.failCreate);
        return;
      }
      revalidateListings();
      router.push(c.redirect);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">{isEdit ? c.headingEdit : c.headingCreate}</h1>
      <p className="text-sm text-ink/60 mb-6">{isEdit ? c.subEdit : c.subCreate}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">{c.titleLabel}</label>
          <input
            className="input"
            required
            placeholder={c.titlePlaceholder}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Kategori</label>
          <select className="input" value={form.category} onChange={(e) => update("category", e.target.value)}>
            {JOB_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{c.descLabel}</label>
          <textarea
            className="input min-h-[120px]"
            required
            placeholder={c.descPlaceholder}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.is_remote} onChange={(e) => update("is_remote", e.target.checked)} />
          Bisa dikerjakan online / remote
        </label>

        <label className="flex items-start gap-2 text-sm font-medium rounded-xl border border-line bg-paper px-3 py-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.is_nego}
            onChange={(e) => update("is_nego", e.target.checked)}
          />
          <span>
            Harga Nego (bukan harga tetap)
            <span className="block text-xs font-normal text-ink/50 mt-0.5">
              Peminat menanyakan & menawar harga langsung lewat chat sebelum {role === "worker" ? "mengajak kerja sama" : "melamar"}.
            </span>
          </span>
        </label>

        {!form.is_remote && (
          <div>
            <label className="label">{c.locLabel}</label>
            <input
              className="input"
              required={!form.is_remote}
              placeholder="Contoh: Jakarta Selatan"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />
            <button type="button" onClick={useMyLocation} className="text-xs font-semibold text-turquoise mt-1.5">
              {locLoading ? "Mengambil lokasi..." : coords ? "Lokasi GPS tersimpan ✓" : "Gunakan lokasi GPS saya saat ini"}
            </button>
            <p className="text-xs text-ink/40 mt-1">{c.locHelp}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{form.is_nego ? c.priceNegoLabel : c.priceLabel}</label>
            <input
              className="input"
              type="number"
              min={1000}
              required
              placeholder="150000"
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
            />
            {form.is_nego && <p className="text-xs text-ink/40 mt-1">{c.priceNegoHelp}</p>}
          </div>
          <div>
            <label className="label">{c.durLabel}</label>
            <input
              className="input"
              required
              placeholder={c.durPlaceholder}
              value={form.estimated_duration}
              onChange={(e) => update("estimated_duration", e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (isEdit ? "Menyimpan..." : "Memasang...") : isEdit ? "Simpan Perubahan" : c.submitCreate}
        </button>
      </form>
    </div>
  );
}
