"use client";
import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Daftarkan service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // gagal daftar (mis. dev mode tanpa https) — tidak fatal
      });
    }

    if (isStandalone()) return; // sudah ter-install, tidak perlu tawarkan lagi
    if (sessionStorage.getItem("kerjahub_pwa_dismissed")) return;

    // Android/Chrome/Edge dsb: browser mengirim event ini begitu app
    // dianggap "installable" (manifest valid + service worker terdaftar +
    // memenuhi syarat browser) — biasanya langsung di kunjungan pertama.
    // Popup kita tampilkan SEGERA saat event ini masuk, bukan menunggu klik
    // apapun dari user.
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowModal(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari TIDAK PERNAH mengirim `beforeinstallprompt` sama sekali —
    // satu-satunya cara instal di iOS adalah lewat menu Share > "Add to
    // Home Screen" secara manual, jadi begitu terdeteksi iOS & belum
    // ter-install, langsung tampilkan popup instruksi manual (tidak perlu
    // menunggu event apapun).
    if (isIOS()) {
      setIosMode(true);
      setShowModal(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    // Popup instal ASLI dari browser cuma bisa dipicu dari klik user
    // (gesture) — .prompt() di sini terjadi persis di dalam handler klik
    // tombol "Install", jadi langsung muncul tanpa penundaan.
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setInstalling(false);
    setDeferredPrompt(null);
    setShowModal(false);
  }

  function dismiss() {
    sessionStorage.setItem("kerjahub_pwa_dismissed", "1");
    setShowModal(false);
  }

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 pwa-install-overlay">
      <div className="card w-full max-w-sm p-6 shadow-xl border-turquoise/30 relative pwa-install-card">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-ink/30 hover:text-ink/60"
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-turquoise-light flex items-center justify-center text-turquoise-dark mb-4">
          <Download size={26} />
        </div>

        <h2 className="font-bold text-lg text-ink">Install KerjaHub</h2>
        <p className="text-sm text-ink/60 mt-1">
          Pasang aplikasi ke layar utama untuk akses lebih cepat, notifikasi langsung, dan pengalaman
          seperti aplikasi native.
        </p>

        {iosMode ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3 text-sm text-ink">
              <span className="w-7 h-7 rounded-full bg-forest-light flex items-center justify-center shrink-0 text-forest-dark">
                <Share size={14} />
              </span>
              <span>
                Tekan tombol <strong>Share</strong> di Safari (ikon kotak dengan panah ke atas)
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-ink">
              <span className="w-7 h-7 rounded-full bg-forest-light flex items-center justify-center shrink-0 text-forest-dark">
                <PlusSquare size={14} />
              </span>
              <span>
                Pilih <strong>&quot;Add to Home Screen&quot;</strong>, lalu ketuk <strong>Add</strong>
              </span>
            </div>
            <button onClick={dismiss} className="btn-secondary w-full !py-2 text-sm mt-2">
              Mengerti
            </button>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <button onClick={dismiss} className="btn-secondary flex-1 !py-2.5 text-sm">
              Nanti saja
            </button>
            <button
              onClick={handleInstall}
              disabled={installing || !deferredPrompt}
              className="btn-primary flex-1 !py-2.5 text-sm"
            >
              {installing ? "Memasang..." : "Install App"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
