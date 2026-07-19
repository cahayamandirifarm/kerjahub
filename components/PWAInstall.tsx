"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showButton, setShowButton] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Daftarkan service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // gagal daftar (mis. dev mode tanpa https) — tidak fatal
      });
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!sessionStorage.getItem("kerjahub_pwa_dismissed")) {
        setShowButton(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowButton(false);
  }

  function dismiss() {
    sessionStorage.setItem("kerjahub_pwa_dismissed", "1");
    setShowButton(false);
    setDismissed(true);
  }

  if (!showButton || dismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-6 sm:right-auto sm:w-80 z-50">
      <div className="card p-4 shadow-lg border-turquoise/30 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-turquoise-light flex items-center justify-center text-turquoise-dark shrink-0">
          <Download size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Install KerjaHub</p>
          <p className="text-xs text-ink/60 mt-0.5">Pasang ke layar utama untuk akses lebih cepat.</p>
          <button onClick={handleInstall} className="btn-primary !px-3 !py-1.5 text-xs mt-3">
            Install App
          </button>
        </div>
        <button onClick={dismiss} className="text-ink/30 hover:text-ink/60 shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
