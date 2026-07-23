"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDistance } from "@/lib/geo-helpers";
import { categoryPostCopy } from "@/lib/category-copy";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { MapPin, MapPinOff, Star, CheckCircle2, Loader2 } from "lucide-react";

interface NearbyJobRow {
  id: string;
  title: string;
  category: string;
  price: number;
  estimated_duration: string;
  district: string | null;
  city: string | null;
  distance_m: number;
}

interface NearbyWorkerRow {
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

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

type LocationStatus = "checking" | "ok" | "denied";

function KategoriContent() {
  const searchParams = useSearchParams();
  const tipe = searchParams.get("tipe") === "jasa" ? "jasa" : "kerja";
  const kategori = searchParams.get("kategori") || "";

  const supabase = createClient();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("checking");
  const [unit, setUnit] = useState<"meter" | "km">("km");
  const [jobs, setJobs] = useState<NearbyJobRow[] | null>(null);
  const [workers, setWorkers] = useState<NearbyWorkerRow[] | null>(null);

  const copy = categoryPostCopy(kategori, tipe);
  const postLink =
    tipe === "kerja" ? "/dashboard/employer/post-job" : "/dashboard/worker/post-listing";

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("key, value")
        .eq("key", "map_unit");
      setUnit((settings?.[0]?.value as "meter" | "km") || "km");

      if (!navigator.geolocation) {
        setLocationStatus("denied");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (tipe === "kerja") {
            const { data } = await supabase.rpc("nearby_jobs", {
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
              p_limit: 100,
              p_category: kategori
            });
            setJobs((data as NearbyJobRow[]) || []);
          } else {
            const { data } = await supabase.rpc("nearby_workers", {
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
              p_limit: 100,
              p_category: kategori
            });
            setWorkers((data as NearbyWorkerRow[]) || []);
          }
          setLocationStatus("ok");
        },
        () => setLocationStatus("denied"),
        { enableHighAccuracy: true, maximumAge: 10 * 60 * 1000 }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipe, kategori]);

  const isLoading = locationStatus === "checking";
  const hasResults = tipe === "kerja" ? (jobs && jobs.length > 0) : (workers && workers.length > 0);
  const noResultsInRadius = locationStatus === "ok" && !hasResults;

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Navbar />

      <section className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <span className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
          {tipe === "kerja" ? "Saya Butuh Pekerja" : "Saya Butuh Pekerjaan"}
        </span>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-ink mt-1">{copy.title}</h1>
        <p className="text-ink/60 mt-1">{copy.subtitle}</p>
      </section>

      <section className="max-w-5xl mx-auto px-4">
        {isLoading && (
          <div className="card p-10 text-center text-ink/50">
            <Loader2 className="mx-auto mb-3 animate-spin" />
            Mencari postingan {kategori.toLowerCase()} di sekitar lokasi Anda...
          </div>
        )}

        {locationStatus === "denied" && (
          <div className="card p-8 text-center">
            <MapPinOff className="mx-auto mb-3 text-ink/40" />
            <p className="font-display font-semibold text-ink">Lokasi belum aktif</p>
            <p className="text-sm text-ink/60 mt-1">
              Aktifkan akses lokasi supaya kami bisa mencocokkan postingan {kategori.toLowerCase()}{" "}
              yang ada di sekitar Anda.
            </p>
            <button onClick={() => setLocationStatus("checking")} className="btn-primary mt-4">
              Coba Lagi
            </button>
          </div>
        )}

        {locationStatus === "ok" && tipe === "kerja" && jobs && jobs.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="card block p-4 hover:-translate-y-0.5 transition">
                <span className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
                  {job.category}
                </span>
                <h3 className="font-display text-lg font-semibold text-ink mt-1 leading-snug line-clamp-2">
                  {job.title}
                </h3>
                <div className="mt-2 flex items-center gap-3 text-sm text-ink/60">
                  <span className="inline-flex items-center gap-1 font-semibold text-turquoise">
                    <MapPin size={13} /> {formatDistance(job.distance_m, unit)}
                  </span>
                  {job.district && <span>{job.district}</span>}
                </div>
                <p className="mt-2 font-display text-lg font-semibold text-gold-dark">
                  {formatRupiah(job.price)}
                </p>
              </Link>
            ))}
          </div>
        )}

        {locationStatus === "ok" && tipe === "jasa" && workers && workers.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {workers.map((w) => (
              <Link key={w.id} href={`/jobs/${w.job_id}`} className="card block p-4 hover:-translate-y-0.5 transition">
                <span className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
                  {w.job_category}
                </span>
                <h3 className="font-display text-lg font-semibold text-ink mt-1 leading-snug line-clamp-2">
                  {w.job_title}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-ink/50 line-clamp-1">oleh {w.full_name}</p>
                  {w.is_online && <span className="w-1.5 h-1.5 rounded-full bg-turquoise shrink-0" />}
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm text-ink/60">
                  <span className="inline-flex items-center gap-1 font-semibold text-turquoise">
                    <MapPin size={13} /> {formatDistance(w.distance_m, unit)}
                  </span>
                  {w.district && <span>{w.district}</span>}
                </div>
                <p className="mt-2 font-display text-lg font-semibold text-gold-dark">
                  {formatRupiah(w.job_price)}
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-ink/50">
                  <span className="inline-flex items-center gap-1">
                    <Star size={12} className="text-gold-dark" /> {w.rating_avg?.toFixed(1) ?? "0.0"} (
                    {w.rating_count})
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> {w.completed_jobs_count} pekerjaan selesai
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {noResultsInRadius && (
        <div className="fixed inset-0 z-[110] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-clay/10 text-clay flex items-center justify-center mx-auto mb-4">
              <MapPinOff size={24} />
            </div>
            <h2 className="font-display text-lg font-bold text-ink mb-2">
              Belum Tersedia di Lokasi Sekitar Anda
            </h2>
            <p className="text-sm text-ink/60 leading-relaxed mb-5">
              Belum ada yang memposting {copy.title.toLowerCase()} dalam radius pencarian di
              lokasi Anda saat ini. Jadilah yang pertama dengan memasang postingan sendiri di
              bawah ini.
            </p>
            <div className="flex flex-col gap-2">
              <Link href={postLink} className="btn-primary w-full">
                {tipe === "kerja" ? "Saya Butuh Pekerja" : "Saya Butuh Pekerjaan"}
              </Link>
              <Link
                href={tipe === "kerja" ? "/dashboard/worker/post-listing" : "/dashboard/employer/post-job"}
                className="btn-secondary w-full"
              >
                {tipe === "kerja" ? "Saya Butuh Pekerjaan" : "Saya Butuh Pekerja"}
              </Link>
              <Link href="/" className="text-sm text-ink/50 mt-1">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function KategoriPage() {
  return (
    <Suspense fallback={null}>
      <KategoriContent />
    </Suspense>
  );
}
