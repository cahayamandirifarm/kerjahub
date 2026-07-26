"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistance } from "@/lib/geo-helpers";
import { swrFetch } from "@/lib/client-cache";
import { MapPin, Navigation, Star, CheckCircle2, Briefcase, User, ChevronRight } from "lucide-react";
import Link from "next/link";
import PostCTAButtons from "@/components/PostCTAButtons";

const PAGE_SIZE = 10;
// Jumlah kartu yang ditampilkan di mode preview (beranda) sebelum tombol
// "Lihat Semua". RPC tetap ambil sampai PREVIEW_FETCH_LIMIT/FULL_FETCH_LIMIT
// item per jenis (job/worker) supaya ada cukup data buat dihitung
// "lebih dari previewCount item -> tampilkan tombol Lihat Semua" dan buat
// paginasi di mode full.
const PREVIEW_COUNT = 4;
const FULL_FETCH_LIMIT = 100;
const PREVIEW_FETCH_LIMIT = 40;

interface NearbyJob {
  kind: "job";
  id: string;
  title: string;
  category: string;
  price: number;
  is_nego: boolean;
  estimated_duration: string;
  district: string | null;
  city: string | null;
  distance_m: number;
}

interface NearbyWorker {
  kind: "worker";
  id: string;
  full_name: string;
  avatar_url: string | null;
  skills: string[] | null;
  district: string | null;
  city: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs_count: number;
  is_online: boolean;
  distance_m: number;
  job_id: string;
  job_title: string;
  job_category: string;
  job_price: number;
  job_is_nego: boolean;
  job_estimated_duration: string;
}

type NearbyItem = NearbyJob | NearbyWorker;

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function NearbyJobsSection({
  variant = "preview"
}: {
  // "preview" -- dipakai di beranda: cuma tampilkan PREVIEW_COUNT kartu +
  //   tombol "Lihat Semua" kalau hasilnya lebih banyak dari itu.
  // "full" -- dipakai di halaman /lowongan-pekerja-terdekat: tampilkan
  //   semua hasil dengan paginasi (10 per halaman).
  variant?: "preview" | "full";
}) {
  const supabase = createClient();
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [unit, setUnit] = useState<"meter" | "km">("km");
  const [page, setPage] = useState(1);

  // Reset ke halaman 1 setiap kali daftar hasil berubah (mis. lokasi
  // berubah atau ada revalidasi cache) -- supaya tidak nyangkut di halaman
  // yang sudah tidak ada datanya.
  useEffect(() => {
    setPage(1);
  }, [items]);

  useEffect(() => {
    (async () => {
      const settings = await new Promise<{ key: string; value: string }[]>((resolve) => {
        swrFetch<{ key: string; value: string }[]>(
          "settings:nearby",
          24 * 60 * 60 * 1000,
          async () => {
            const { data } = await supabase
              .from("platform_settings")
              .select("key, value")
              .in("key", ["nearby_jobs_enabled", "nearby_workers_enabled", "map_unit"]);
            return data || [];
          },
          (value) => resolve(value),
          "local"
        );
      });
      const jobsEnabled = settings?.find((s) => s.key === "nearby_jobs_enabled")?.value !== "false";
      const workersEnabled = settings?.find((s) => s.key === "nearby_workers_enabled")?.value !== "false";
      const isEnabled = jobsEnabled || workersEnabled;
      setUnit((settings?.find((s) => s.key === "map_unit")?.value as "meter" | "km") || "km");
      setEnabled(isEnabled);
      if (!isEnabled || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Kunci cache dibulatkan ke ~1km supaya pergerakan GPS kecil tetap
          // pakai cache yang sama. Hasil dianggap valid sampai 7 hari --
          // sekali diambil dipakai terus dari cache device, TIDAK query ulang
          // ke Supabase sampai 7 hari berlalu (sesuai permintaan: nearby
          // jangan ambil resource API lagi selama masih dalam rentang itu).
          const latKey = pos.coords.latitude.toFixed(2);
          const lngKey = pos.coords.longitude.toFixed(2);
          // TTL diturunkan dari 7 hari -> 15 menit. Dengan TTL 7 hari,
          // postingan yang baru dihapus/dinonaktifkan pengirimnya tetap
          // tampil di kartu "Lowongan & Pekerja Terdekat" sampai 7 hari
          // karena swrFetch SAMA SEKALI TIDAK query ulang ke Supabase
          // selama cache masih "fresh" (lihat lib/client-cache.ts). 15
          // menit selaras dengan cache sisi server (getHomeJobs, dll)
          // supaya postingan yang sudah dihapus/nonaktif hilang dari
          // tampilan dalam waktu wajar, sambil tetap mengurangi request
          // berulang ke Supabase saat beranda dibuka berkali-kali.
          const fetchLimit = variant === "full" ? FULL_FETCH_LIMIT : PREVIEW_FETCH_LIMIT;
          swrFetch<NearbyItem[]>(
            `nearby:${variant}:${latKey}:${lngKey}`,
            15 * 60 * 1000,
            async () => {
              const [jobsRes, workersRes] = await Promise.all([
                jobsEnabled
                  ? supabase.rpc("nearby_jobs", {
                      p_lat: pos.coords.latitude,
                      p_lng: pos.coords.longitude,
                      p_limit: fetchLimit
                    })
                  : Promise.resolve({ data: [] as NearbyJob[] }),
                workersEnabled
                  ? supabase.rpc("nearby_workers", {
                      p_lat: pos.coords.latitude,
                      p_lng: pos.coords.longitude,
                      p_limit: fetchLimit
                    })
                  : Promise.resolve({ data: [] as NearbyWorker[] })
              ]);
              const jobs: NearbyItem[] = (jobsRes.data || []).map((j: any) => ({ ...j, kind: "job" as const }));
              const workers: NearbyItem[] = (workersRes.data || []).map((w: any) => ({ ...w, kind: "worker" as const }));
              return [...jobs, ...workers].sort((a, b) => a.distance_m - b.distance_m);
            },
            (merged) => setItems(merged),
            "idb"
          );
        },
        () => setItems(null),
        { maximumAge: 10 * 60 * 1000 }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled || !items) return null;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // Mode preview: potong ke PREVIEW_COUNT kartu saja.
  // Mode full: potong sesuai halaman aktif, PAGE_SIZE (10) kartu per halaman.
  const visibleItems =
    variant === "preview" ? items.slice(0, PREVIEW_COUNT) : items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showViewAllButton = variant === "preview" && items.length > PREVIEW_COUNT;

  return (
    <section id="lowongan-terdekat" className="max-w-5xl mx-auto px-4 mb-8 scroll-mt-24">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-turquoise" />
          <h2 className="font-display text-lg font-semibold">Lowongan &amp; Pekerja Terdekat</h2>
        </div>
        {showViewAllButton && (
          <Link
            href="/lowongan-pekerja-terdekat"
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-turquoise shrink-0"
          >
            Lihat Semua <ChevronRight size={15} />
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink/60">Belum tersedia lowongan &amp; pekerja sekitar.</p>
          <p className="font-display font-semibold text-ink mt-1">Pasang Lowongan &amp; Pekerja Sekarang</p>
          <div className="flex justify-center">
            <PostCTAButtons />
          </div>
        </div>
      ) : (
      <div className="grid sm:grid-cols-2 gap-4">
        {visibleItems.map((item) =>
          item.kind === "job" ? (
            <Link
              key={`job-${item.id}`}
              href={`/jobs/${item.id}`}
              className="card block p-4 hover:-translate-y-0.5 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-turquoise uppercase">
                    <Briefcase size={12} /> {item.category}
                  </span>
                  <h3 className="font-display text-base font-semibold text-ink mt-0.5 line-clamp-2">
                    {item.title}
                  </h3>
                </div>
                <span className="badge-stage stage-terbuka shrink-0">Lowongan</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm text-ink/60">
                <span className="inline-flex items-center gap-1 font-semibold text-turquoise">
                  <MapPin size={13} /> {formatDistance(item.distance_m, unit)}
                </span>
                {item.district && <span>{item.district}</span>}
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-gold-dark">
                {item.is_nego ? "Nego" : formatRupiah(item.price)}
              </p>
            </Link>
          ) : (
            <Link
              key={`worker-${item.job_id}`}
              href={`/jobs/${item.job_id}`}
              className="card block p-4 hover:-translate-y-0.5 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-turquoise uppercase">
                    <User size={12} /> {item.job_category}
                  </span>
                  <h3 className="font-display text-base font-semibold text-ink mt-0.5 line-clamp-2">
                    {item.job_title}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-4 h-4 rounded-full bg-turquoise-light overflow-hidden shrink-0 flex items-center justify-center text-[8px] font-semibold text-turquoise-dark">
                      {item.avatar_url ? (
                        <img src={item.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.full_name?.[0]?.toUpperCase() ?? "?"
                      )}
                    </span>
                    <p className="text-xs text-ink/50 line-clamp-1">oleh {item.full_name}</p>
                    {item.is_online && <span className="w-1.5 h-1.5 rounded-full bg-turquoise shrink-0" />}
                  </div>
                </div>
                <span className="badge-stage stage-terbuka shrink-0">Pekerja</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm text-ink/60">
                <span className="inline-flex items-center gap-1 font-semibold text-turquoise">
                  <MapPin size={13} /> {formatDistance(item.distance_m, unit)}
                </span>
                {item.district && <span>{item.district}</span>}
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-gold-dark">
                {item.job_is_nego ? "Nego" : formatRupiah(item.job_price)}
              </p>
              {item.skills && item.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.skills.map((s) => (
                    <span key={s} className="text-xs bg-turquoise-light text-turquoise-dark rounded-full px-2 py-1">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-ink/50">
                <span className="inline-flex items-center gap-1">
                  <Star size={12} className="text-gold-dark" /> {item.rating_avg?.toFixed(1) ?? "0.0"} (
                  {item.rating_count})
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={12} /> {item.completed_jobs_count} pekerjaan selesai
                </span>
              </div>
            </Link>
          )
        )}
      </div>
      )}

      {variant === "full" && items.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-8">
          {page > 1 ? (
            <button
              onClick={() => {
                setPage((p) => p - 1);
                document.getElementById("lowongan-terdekat")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5"
            >
              Sebelumnya
            </button>
          ) : (
            <span className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white/50 text-ink/30 cursor-not-allowed">
              Sebelumnya
            </span>
          )}
          <span className="text-sm text-ink/50 font-semibold px-1">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages ? (
            <button
              onClick={() => {
                setPage((p) => p + 1);
                document.getElementById("lowongan-terdekat")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5"
            >
              Berikutnya
            </button>
          ) : (
            <span className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white/50 text-ink/30 cursor-not-allowed">
              Berikutnya
            </span>
          )}
        </div>
      )}
    </section>
  );
}
