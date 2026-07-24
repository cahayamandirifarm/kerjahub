"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDistance } from "@/lib/geo-helpers";
import { MapPin, Star, CheckCircle2, Search } from "lucide-react";

interface NearbyWorker {
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
}

export default function NearbyWorkersPage() {
  const supabase = createClient();
  const [workers, setWorkers] = useState<NearbyWorker[] | null>(null);
  const [status, setStatus] = useState<"loading" | "no-permission" | "ready" | "disabled">("loading");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    (async () => {
      const { data: setting } = await supabase.from("platform_settings").select("value").eq("key", "nearby_workers_enabled").single();
      if (setting?.value === "false") {
        setStatus("disabled");
        return;
      }
      if (!navigator.geolocation) {
        setStatus("no-permission");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { data } = await supabase.rpc("nearby_workers", {
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
            p_limit: 30,
            p_search: search || null
          });
          setWorkers(data || []);
          setStatus("ready");
        },
        () => setStatus("no-permission"),
        { enableHighAccuracy: true }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Pekerja Terdekat</h1>
      <p className="text-sm text-ink/60 mb-6">Ditemukan berdasarkan jarak, rating, dan jumlah pekerjaan selesai.</p>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama pekerja, jasa, atau skill..."
          className="input !pl-10"
        />
      </div>

      {status === "loading" && <div className="card p-6 text-center text-ink/50 text-sm">Mencari lokasi...</div>}
      {status === "disabled" && (
        <div className="card p-6 text-center text-ink/50 text-sm">Fitur ini sedang dinonaktifkan oleh admin.</div>
      )}
      {status === "no-permission" && (
        <div className="card p-6 text-center text-ink/50 text-sm">
          Izin lokasi diperlukan untuk melihat pekerja terdekat.
        </div>
      )}
      {status === "ready" && (!workers || workers.length === 0) && (
        <div className="card p-6 text-center text-ink/50 text-sm">
          {search ? `Tidak ada hasil untuk "${search}".` : "Belum ada pekerja dalam radius pencarian."}
        </div>
      )}

      <div className="space-y-3">
        {workers?.map((w) => (
          <div key={w.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{w.full_name}</p>
                  {w.is_online && <span className="w-2 h-2 rounded-full bg-turquoise" />}
                </div>
                <p className="text-xs text-ink/50">{w.district || w.city || "Lokasi tidak diketahui"}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise shrink-0">
                <MapPin size={13} /> {formatDistance(w.distance_m)}
              </span>
            </div>
            {w.skills && w.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {w.skills.map((s) => (
                  <span key={s} className="text-xs bg-turquoise-light text-turquoise-dark rounded-full px-2 py-1">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-ink/50">
              <span className="inline-flex items-center gap-1">
                <Star size={12} className="text-gold-dark" /> {w.rating_avg?.toFixed(1) ?? "0.0"} ({w.rating_count})
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> {w.completed_jobs_count} pekerjaan selesai
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
