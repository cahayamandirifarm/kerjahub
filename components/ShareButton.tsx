"use client";
import { useEffect, useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ShareButton({
  path,
  title,
  text
}: {
  // Path relatif postingan, mis. `/jobs/${job.id}` atau `/produk/${listing.id}`
  path: string;
  title: string;
  text?: string;
}) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      // Pakai RPC yang sudah ada (menu "Kode Referral Kamu") -- ambil kode
      // referral milik user yang sedang share, BUKAN milik pemilik
      // postingan. Jadi siapa pun yang share (termasuk pemilik postingan
      // sendiri) dan ada orang daftar lewat link itu, upline-nya adalah
      // orang yang share -- sesuai cara kerja sistem referral yang sudah ada.
      const { data } = await supabase.rpc("get_my_referral_info");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.referral_code) setReferralCode(row.referral_code);
    });
  }, []);

  function buildUrl() {
    const base = `${window.location.origin}${path}`;
    return referralCode ? `${base}?ref=${referralCode}` : base;
  }

  async function handleShareClick() {
    const url = buildUrl();
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text: text || title, url });
        return;
      } catch {
        // Ditutup/dibatalkan user -- tidak perlu tindakan apa pun.
        return;
      }
    }
    // Browser desktop / tidak dukung Web Share API -- tampilkan pilihan manual.
    setShowFallback((s) => !s);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API diblokir -- fallback diam-diam, link tetap kelihatan
      // di tombol "Bagikan lewat ..." di bawahnya.
    }
  }

  const shareUrl = buildUrl();
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(title);

  return (
    <div>
      <button type="button" onClick={handleShareClick} className="btn-secondary w-full">
        <Share2 size={17} /> Bagikan Postingan Ini
      </button>

      {referralCode && (
        <p className="text-xs text-center text-ink/40 mt-1.5">
          Link berisi kode referral kamu — kalau ada yang daftar lewat link ini, otomatis jadi downline-mu.
        </p>
      )}

      {showFallback && (
        <div className="card p-3 mt-2 space-y-1">
          <a
            href={`https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`}
            target="_blank"
            rel="noreferrer"
            className="block px-2 py-2 rounded-lg text-sm font-semibold text-ink/70 hover:bg-paper hover:text-turquoise-dark"
          >
            Bagikan lewat WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
            target="_blank"
            rel="noreferrer"
            className="block px-2 py-2 rounded-lg text-sm font-semibold text-ink/70 hover:bg-paper hover:text-turquoise-dark"
          >
            Bagikan lewat Facebook
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
            target="_blank"
            rel="noreferrer"
            className="block px-2 py-2 rounded-lg text-sm font-semibold text-ink/70 hover:bg-paper hover:text-turquoise-dark"
          >
            Bagikan lewat X (Twitter)
          </a>
          <a
            href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`}
            target="_blank"
            rel="noreferrer"
            className="block px-2 py-2 rounded-lg text-sm font-semibold text-ink/70 hover:bg-paper hover:text-turquoise-dark"
          >
            Bagikan lewat Telegram
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-semibold text-ink/70 hover:bg-paper hover:text-turquoise-dark"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Link tersalin!" : "Salin Link"}
          </button>
        </div>
      )}
    </div>
  );
}
