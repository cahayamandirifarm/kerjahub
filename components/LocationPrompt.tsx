"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import { reverseGeocode } from "@/lib/geo-helpers";
import { swrFetch } from "@/lib/client-cache";
import { MapPin, X } from "lucide-react";

export default function LocationPrompt({ onLocated }: { onLocated?: (lat: number, lng: number) => void }) {
  const { user } = useAuth();
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [settingEnabled, setSettingEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      let enabled = true;
      await swrFetch<boolean>(
        "settings:gps_request_enabled",
        24 * 60 * 60 * 1000,
        async () => {
          const { data } = await supabase.from("platform_settings").select("value").eq("key", "gps_request_enabled").single();
          return data?.value !== "false";
        },
        (value) => {
          enabled = value;
          setSettingEnabled(value);
        },
        "local"
      );
      if (!enabled) return;

      const skipped = sessionStorage.getItem("kerjahub_location_skipped");
      if (skipped) return;

      if (!navigator.geolocation) return;

      // Coba diam-diam dulu (kalau izin sudah pernah diberikan, browser tidak akan menampilkan popup lagi)
      navigator.geolocation.getCurrentPosition(
        (pos) => handleLocated(pos.coords.latitude, pos.coords.longitude),
        () => setShow(true),
        { maximumAge: 10 * 60 * 1000 }
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLocated(lat: number, lng: number) {
    setShow(false);
    onLocated?.(lat, lng);
    if (user) {
      const geo = await reverseGeocode(lat, lng);
      await supabase.rpc("update_my_location", {
        p_lat: lat,
        p_lng: lng,
        p_province: geo.province,
        p_city: geo.city,
        p_district: geo.district,
        p_village: geo.village
      });
    }
  }

  function requestLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => handleLocated(pos.coords.latitude, pos.coords.longitude),
      () => setShow(false),
      { enableHighAccuracy: true }
    );
  }

  function skip() {
    sessionStorage.setItem("kerjahub_location_skipped", "1");
    setShow(false);
    setDismissed(true);
  }

  if (!settingEnabled || !show || dismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50">
      <div className="card p-4 shadow-lg border-turquoise/30 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-turquoise-light flex items-center justify-center text-turquoise-dark shrink-0">
          <MapPin size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Aktifkan Lokasi</p>
          <p className="text-xs text-ink/60 mt-0.5">
            Izinkan akses lokasi untuk melihat pekerjaan terdekat di sekitarmu.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={requestLocation} className="btn-primary !px-3 !py-1.5 text-xs">
              Aktifkan Lokasi
            </button>
            <button onClick={skip} className="btn-secondary !px-3 !py-1.5 text-xs">
              Nanti saja
            </button>
          </div>
        </div>
        <button onClick={skip} className="text-ink/30 hover:text-ink/60 shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
