"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { pushSupported, getPushSubscriptionStatus, subscribeToPush } from "@/lib/push";
import { Bell, X } from "lucide-react";

// Muncul otomatis begitu app SUDAH ter-install (dibuka dalam mode
// standalone/PWA) & pengguna sudah login, tapi izin notifikasi push-nya
// belum pernah ditentukan (belum "granted" ataupun "denied") dan belum
// ada subscription tersimpan. Beda dengan toggle manual di halaman Akun
// (/kyc) yang menunggu pengguna membuka halaman itu sendiri -- popup ini
// proaktif menawarkan begitu app dibuka dari layar utama.
const DISMISS_KEY = "kerjahub_notif_prompt_dismissed_at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 hari sebelum ditawarkan lagi

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export default function EnableNotificationsPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!isStandalone()) return; // cuma tawarkan kalau app sudah ter-install
    if (!pushSupported()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "default") return; // sudah pernah diizinkan/ditolak
    if (recentlyDismissed()) return;

    // Beri jeda sedikit supaya tidak "menyerbu" begitu app baru dibuka.
    const t = setTimeout(async () => {
      const status = await getPushSubscriptionStatus();
      if (status === "unsubscribed") setShow(true);
    }, 1200);

    return () => clearTimeout(t);
  }, [user]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function handleEnable() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await subscribeToPush(user.id);
      setShow(false);
    } catch (err: any) {
      setError(err?.message || "Gagal mengaktifkan notifikasi.");
    } finally {
      setLoading(false);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-sm p-6 shadow-xl border-turquoise/30 relative">
        <button onClick={dismiss} className="absolute top-3 right-3 text-ink/30 hover:text-ink/60" aria-label="Tutup">
          <X size={18} />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-turquoise-light flex items-center justify-center text-turquoise-dark mb-4">
          <Bell size={26} />
        </div>

        <h2 className="font-bold text-lg text-ink">Aktifkan Notifikasi</h2>
        <p className="text-sm text-ink/60 mt-1">
          Dapatkan info langsung saat ada pesan chat baru, lamaran, tawaran nego, atau pembayaran — walau
          aplikasi sedang ditutup.
        </p>

        {error && <p className="text-xs text-clay mt-2">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={dismiss} className="btn-secondary flex-1 !py-2.5 text-sm">
            Nanti saja
          </button>
          <button onClick={handleEnable} disabled={loading} className="btn-primary flex-1 !py-2.5 text-sm">
            {loading ? "Mengaktifkan..." : "Aktifkan"}
          </button>
        </div>
      </div>
    </div>
  );
}
