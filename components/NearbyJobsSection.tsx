"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistance } from "@/lib/geo-helpers";
import { MapPin, Navigation } from "lucide-react";
import Link from "next/link";

interface NearbyJob {
  id: string;
  title: string;
  category: string;
  price: number;
  estimated_duration: string;
  district: string | null;
  city: string | null;
  distance_m: number;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function NearbyJobsSection() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<NearbyJob[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [unit, setUnit] = useState<"meter" | "km">("km");

  useEffect(() => {
    (async () => {
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["nearby_jobs_enabled", "map_unit"]);
      const isEnabled = settings?.find((s) => s.key === "nearby_jobs_enabled")?.value !== "false";
      setUnit((settings?.find((s) => s.key === "map_unit")?.value as "meter" | "km") || "km");
      setEnabled(isEnabled);
      if (!isEnabled || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { data } = await supabase.rpc("nearby_jobs", {
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
            p_limit: 6
          });
          setJobs(data || []);
        },
        () => setJobs(null),
        { maximumAge: 10 * 60 * 1000 }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled || !jobs || jobs.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Navigation size={16} className="text-forest" />
        <h2 className="font-display text-lg font-semibold">Pekerjaan Terdekat</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {jobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="card block p-4 hover:-translate-y-0.5 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-forest uppercase">{job.category}</span>
                <h3 className="font-display text-base font-semibold text-ink mt-0.5 line-clamp-2">{job.title}</h3>
              </div>
              <span className="badge-stage stage-terbuka shrink-0">Terdekat</span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm text-ink/60">
              <span className="inline-flex items-center gap-1 font-semibold text-forest">
                <MapPin size={13} /> {formatDistance(job.distance_m, unit)}
              </span>
              {job.district && <span>{job.district}</span>}
            </div>
            <p className="mt-2 font-display text-lg font-semibold text-gold-dark">{formatRupiah(job.price)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
