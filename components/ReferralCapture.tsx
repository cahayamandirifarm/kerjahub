"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Dipasang sekali di root layout, jalan di SETIAP halaman (termasuk halaman
// detail postingan yang dibagikan lewat ShareButton). Kalau URL yang dibuka
// punya ?ref=KODE (dari link share/referral), kode itu disimpan di
// localStorage selama 30 hari -- supaya kalau orangnya baru daftar
// belakangan (bukan langsung dari halaman itu), /register tetap bisa
// mengambil kode ini walau parameter ?ref= sudah tidak ada lagi di URL saat
// itu. Validasi kode (apakah benar-benar ada pemiliknya) tetap dilakukan di
// /register saat submit lewat RPC is_referral_code_valid -- di sini cuma
// nyimpen mentah-mentah.
const STORAGE_KEY = "kerjahub_ref_code";
const STORAGE_DAYS = 30;

export default function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    const code = ref.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ code, expires: Date.now() + STORAGE_DAYS * 24 * 60 * 60 * 1000 })
      );
    } catch {
      // localStorage tidak tersedia (mis. mode privat/incognito ketat) --
      // abaikan saja, jalur ?ref= langsung ke /register tetap jalan normal.
    }
  }, [searchParams]);

  return null;
}

// Dipakai di /register untuk fallback kalau tidak ada ?ref= di URL saat itu.
export function getSavedReferralCode(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; expires?: number };
    if (!parsed.code || !parsed.expires || Date.now() > parsed.expires) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}
