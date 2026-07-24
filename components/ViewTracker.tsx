"use client";

import { useEffect } from "react";

// Mencatat 1 view untuk job/listing SETELAH halaman selesai dimuat di
// browser -- tidak ikut memperlambat/nge-block render halaman di server.
// Dedup per tab/sesi lewat sessionStorage supaya reload berkali-kali oleh
// pengunjung yang sama tidak terus menambah angka view.
export default function ViewTracker({ type, id }: { type: "job" | "listing"; id: string }) {
  useEffect(() => {
    const key = `viewed:${type}:${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    const body = JSON.stringify({ type, id });
    // sendBeacon lebih ringan & tidak diblokir saat user langsung pindah
    // halaman; fallback ke fetch keepalive kalau tidak tersedia.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track-view", blob);
    } else {
      fetch("/api/track-view", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  }, [type, id]);

  return null;
}
