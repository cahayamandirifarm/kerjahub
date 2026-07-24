"use client";
import { useEffect, useState } from "react";
import { waLink } from "@/lib/whatsapp";

// Domain resmi KerjaHub -- dipakai di template pesan WA (bukan link chat
// internal) supaya penerima tahu pesan ini datang dari calon
// pekerja/pemberi-kerja/pembeli yang menemukannya lewat platform KerjaHub.
const KERJAHUB_URL = "https://www.kerjahub.info";

type Props = {
  kind: "job" | "listing";
  refId: string;
  ownerId: string;
  ownerPhone: string | null | undefined;
  title: string;
  /** Harga yang sudah diformat, mis. "Rp 250.000" atau "Harga Nego (estimasi Rp 250.000)". */
  priceLabel: string;
};

// Template "kartu" produk/postingan dalam bentuk teks -- WhatsApp tidak
// mendukung kartu rich-preview lewat wa.me, jadi info judul/harga/link
// disusun rapi di badan pesan supaya penerima langsung tahu konteksnya
// tanpa perlu buka link dulu. Sekaligus disisipi peringatan supaya
// transaksi tetap dilakukan di KerjaHub (bukan transfer langsung lewat WA)
// -- ini vektor umum penipuan sebelum ada perlindungan Escrow.
function buildMessage({
  kind,
  title,
  priceLabel,
  url
}: {
  kind: "job" | "listing";
  title: string;
  priceLabel: string;
  url: string;
}) {
  const noun = kind === "job" ? "postingan" : "produk";
  return `Halo, saya pengguna KerjaHub (${KERJAHUB_URL}) dan tertarik dengan ${noun} berikut:

📌 *${title}*
💰 ${priceLabel}
🔗 ${url}

Boleh tanya-tanya dulu sebelum lanjut ya 🙏

⚠️ *Penting:* Untuk keamanan bersama, hindari transaksi di luar aplikasi KerjaHub / lewat WhatsApp.
✅ Lakukan Transaksi di KerjaHub — Kerja Nyaman, Dompet Aman. #KerjaHub
🔒 Sistem Transaksi Escrow KerjaHub memberikan keamanan transaksi bagi pekerja dan pelanggan.`;
}

/**
 * Tombol "Tanya via WhatsApp" -- pelengkap ChatInquiryButton (chat internal)
 * di halaman detail lowongan/jasa & produk marketplace. Nomor WA diambil
 * dari profil pemilik postingan (profiles.phone). Disembunyikan otomatis
 * kalau pemilik tidak mencantumkan nomor, atau kalau yang melihat adalah
 * pemilik postingan itu sendiri.
 */
export default function WhatsAppInquiryButton({ kind, refId, ownerId, ownerPhone, title, priceLabel }: Props) {
  const [isOwner, setIsOwner] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setIsOwner(!!user && user.id === ownerId);
      setChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked || isOwner) return null;

  const url = `${KERJAHUB_URL}/${kind === "job" ? "jobs" : "marketplace"}/${refId}`;
  const wa = waLink(ownerPhone, buildMessage({ kind, title, priceLabel, url }));

  if (!wa) return null;

  return (
    <a
      href={wa}
      target="_blank"
      rel="noreferrer"
      className="w-full rounded-full text-sm font-semibold py-3 inline-flex items-center justify-center gap-2"
      style={{ backgroundColor: "#25D366", color: "#ffffff" }}
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.2-1.36a9.94 9.94 0 0 0 4.84 1.23h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm0 18.2h-.01c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.09.81.82-3-.2-.31a8.17 8.17 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.55-3.7 8.24-8.2 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.4-.12-.56.13-.17.25-.65.81-.79.97-.15.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.86-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.86-.87 2.1s.9 2.43 1.02 2.6c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.42 1.43.53.6.19 1.15.17 1.59.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28z" />
      </svg>
      Tanya via WhatsApp
    </a>
  );
}
