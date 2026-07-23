"use client";
import { useRouter, usePathname } from "next/navigation";
import { useNegoOfferPopup } from "@/lib/NegoOfferPopupContext";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { X, HandCoins } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function NegoOfferPopupOverlay() {
  const { popup, loading, processing, dismiss } = useNegoOfferPopup();
  const { activeJob } = useActiveJobLock();
  const pathname = usePathname();
  const router = useRouter();

  if (loading || !popup) return null;
  // Jangan tabrakan dengan overlay job aktif yang sudah mengunci app,
  // dan jangan muncul di halaman login/register/admin.
  if (activeJob) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;
  // Kalau pengguna sedang berada di dalam percakapan yang sama, tawarannya
  // sudah langsung kelihatan lewat bubble chat realtime -- popup ini tidak
  // perlu menimpa layar itu.
  if (pathname === `/chat/${popup.conversation_id}`) return null;

  async function handleClose() {
    await dismiss();
  }

  async function handleLihat() {
    await dismiss();
    router.push(`/chat/${popup!.conversation_id}`);
  }

  return (
    <div className="fixed inset-0 z-[95] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-turquoise-dark text-white px-6 pt-6 pb-5 relative">
          <button
            onClick={handleClose}
            disabled={processing}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25"
            aria-label="Tutup"
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-2 text-white/70 mb-1">
            <HandCoins size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">
              {popup.kind === "offer" ? "Ada pesanan yang ingin bernegosiasi" : "Ada yang menanyakan harga"}
            </span>
          </div>
          <h2 className="text-lg font-extrabold leading-snug">{popup.job_title}</h2>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-turquoise-light text-turquoise-dark flex items-center justify-center font-display font-bold overflow-hidden shrink-0">
              {popup.offerer_avatar ? (
                <img src={popup.offerer_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                popup.offerer_name?.[0]?.toUpperCase() ?? "?"
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{popup.offerer_name}</p>
              <p className="text-sm text-ink/60">
                {popup.kind === "offer" && popup.amount != null ? (
                  <>
                    Menawar <span className="font-semibold text-turquoise-dark">{formatRupiah(popup.amount)}</span>
                  </>
                ) : (
                  "Ingin menanyakan & menegosiasikan harga untuk postingan ini"
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleLihat}
            disabled={processing}
            className="btn-primary w-full !py-2.5 text-sm mt-5"
          >
            {processing ? "Membuka..." : popup.kind === "offer" ? "Lihat Sekarang" : "Buka & Balas Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
