"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistance } from "@/lib/geo-helpers";
import { MapPin, Navigation, Star, CheckCircle2, Briefcase, User } from "lucide-react";
import Link from "next/link";
import PostCTAButtons from "@/components/PostCTAButtons";

interface NearbyJob {
  kind: "job";
  id: string;
  title: string;
  category: string;
  price: number;
  estimated_duration: string;
  district: string | null;
  city: string | null;
  distance_m: number;
}

interface NearbyWorker {
  kind: "worker";
  id: string;
  full_name: string;
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
  job_estimated_duration: string;
}

type NearbyItem = NearbyJob | NearbyWorker;

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function NearbyJobsSection() {
  const supabase = createClient();
  const [items, setItems] = useState<NearbyItem[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [unit, setUnit] = useState<"meter" | "km">("km");

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["nearby_jobs_enabled", "nearby_workers_enabled", "map_unit"]);
      const jobsEnabled = settings?.find((s) => s.key === "nearby_jobs_enabled")?.value !== "false";
      const workersEnabled = settings?.find((s) => s.key === "nearby_workers_enabled")?.value !== "false";
      const isEnabled = jobsEnabled || workersEnabled;
      setUnit((settings?.find((s) => s.key === "map_unit")?.value as "meter" | "km") || "km");
      setEnabled(isEnabled);
      if (!isEnabled || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          // Tanpa limit kecil / tanpa sub-menu terpisah: ambil semua lowongan
          // & pekerja dalam radius yang sudah diatur admin (default_radius_km),
          // lalu gabungkan jadi satu daftar terurut berdasarkan jarak.
          const [jobsRes, workersRes] = await Promise.all([
            jobsEnabled
              ? supabase.rpc("nearby_jobs", {
                  p_lat: pos.coords.latitude,
                  p_lng: pos.coords.longitude,
                  p_limit: 200
                })
              : Promise.resolve({ data: [] as NearbyJob[] }),
            workersEnabled
              ? supabase.rpc("nearby_workers", {
                  p_lat: pos.coords.latitude,
                  p_lng: pos.coords.longitude,
                  p_limit: 200
                })
              : Promise.resolve({ data: [] as NearbyWorker[] })
          ]);

          const jobs: NearbyItem[] = (jobsRes.data || []).map((j: any) => ({ ...j, kind: "job" as const }));
          const workers: NearbyItem[] = (workersRes.data || []).map((w: any) => ({ ...w, kind: "worker" as const }));

          const merged = [...jobs, ...workers].sort((a, b) => a.distance_m - b.distance_m);
          setItems(merged);
        },
        () => setItems(null),
        { maximumAge: 10 * 60 * 1000 }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled || !items) return null;

  return (
    <section id="lowongan-terdekat" className="max-w-5xl mx-auto px-4 mb-8 scroll-mt-24">
      <div className="flex items-center gap-2 mb-4">
        <Navigation size={16} className="text-turquoise" />
        <h2 className="font-display text-lg font-semibold">Lowongan &amp; Pekerja Terdekat</h2>
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
        {items.map((item) =>
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
                {formatRupiah(item.price)}
              </p>
            </Link>
          ) : (
            <Link
              key={`worker-${item.id}`}
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
                {formatRupiah(item.job_price)}
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
    </section>
  );
}
