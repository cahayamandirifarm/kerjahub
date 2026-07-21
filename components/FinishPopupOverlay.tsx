"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useFinishPopup } from "@/lib/FinishPopupContext";
import { CheckCircle2, Wallet, Trash2, RefreshCw } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function FinishPopupOverlay() {
  const { popup, loading, processing, keepPosted, removePosting } = useFinishPopup();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (loading || !popup) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;

  async function handleKeep() {
    setError(null);
    const res = await keepPosted();
    if (res.error) setError(res.error);
  }

  async function handleRemove() {
    setError(null);
    const res = await removePosting();
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmingDelete(false);
  }

  return (
    // z-index sengaja di atas CompletionPopupOverlay (z-102) supaya popup ini
    // yang tampil belakangan, setelah popup persetujuan selesai ditutup.
    <div className="fixed inset-0 z-[103] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden my-auto">
        <div className="bg-turquoise-dark text-white px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 text-white/70 mb-1">
            <CheckCircle2 size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Pekerjaan selesai</span>
          </div>
          <h2 className="text-lg font-extrabold leading-snug">{popup.job_title}</h2>
          <p className="text-xs text-white/70 mt-0.5">{formatRupiah(popup.price)}</p>
        </div>

        <div className="p-6">
          {popup.poster_received_wage ? (
            <div className="flex items-start gap-3 bg-turquoise-light/50 rounded-2xl p-4">
              <Wallet size={20} className="text-turquoise-dark shrink-0 mt-0.5" />
              <p className="text-sm text-ink">
                Pekerjaan ini telah selesai dan upah{" "}
                <span className="font-bold">{formatRupiah(popup.wage_amount ?? 0)}</span> sudah masuk ke dompet kamu.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-turquoise-light/50 rounded-2xl p-4">
              <Wallet size={20} className="text-turquoise-dark shrink-0 mt-0.5" />
              <p className="text-sm text-ink">
                Pekerjaan ini telah selesai dan upah sudah dibayarkan ke pekerja.
              </p>
            </div>
          )}

          <p className="text-sm text-ink/70 mt-4">
            Apakah kamu ingin menghapus postingan ini, atau tetap membiarkannya diposting?
          </p>

          {error && <p className="text-sm text-clay mt-3">{error}</p>}

          {!confirmingDelete ? (
            <div className="space-y-2.5 mt-4">
              <button onClick={handleKeep} disabled={processing} className="btn-primary w-full !py-2.5 text-sm flex items-center justify-center gap-1.5">
                <RefreshCw size={15} /> {processing ? "Memproses..." : "Tetap Diposting"}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={processing}
                className="btn-secondary w-full !py-2.5 text-sm flex items-center justify-center gap-1.5 text-clay"
              >
                <Trash2 size={15} /> Hapus Postingan
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-ink/50 mt-4">
                Postingan &quot;{popup.job_title}&quot; akan dihapus dari daftar postinganmu. Riwayat transaksi tetap
                tersimpan.
              </p>
              <div className="space-y-2.5 mt-3">
                <button onClick={handleRemove} disabled={processing} className="btn-gold w-full !py-2.5 text-sm">
                  {processing ? "Menghapus..." : "Ya, Hapus Postingan"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} disabled={processing} className="btn-secondary w-full !py-2.5 text-sm">
                  Batal
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
