"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCompletionPopup } from "@/lib/CompletionPopupContext";
import { X, Star, BadgeCheck, CheckCircle2, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function CompletionPopupOverlay() {
  const { popup, loading, processing, dismiss, approve, requestRevision } = useCompletionPopup();
  const pathname = usePathname();
  const router = useRouter();
  const [showPhotos, setShowPhotos] = useState(true);
  const [showRevision, setShowRevision] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (loading || !popup) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;

  async function handleClose() {
    setShowRevision(false);
    await dismiss();
  }

  async function handleApprove() {
    setError(null);
    const res = await approve(rating, review);
    if (res.error) {
      setError(res.error);
      return;
    }
  }

  async function handleRevision() {
    setError(null);
    if (!revisionNote.trim()) {
      setError("Jelaskan dulu apa yang perlu diperbaiki.");
      return;
    }
    const res = await requestRevision(revisionNote);
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowRevision(false);
    setRevisionNote("");
  }

  return (
    // z-index sengaja di atas ActiveJobOverlay (z-100) & ApplicantPopupOverlay
    // (z-95) supaya popup aksi ini yang menang saat semuanya berpotensi tampil
    // bersamaan untuk pekerjaan yang sama.
    <div className="fixed inset-0 z-[102] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden my-auto">
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
            <CheckCircle2 size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Pekerjaan selesai dikerjakan</span>
          </div>
          <h2 className="text-lg font-extrabold leading-snug">{popup.job_title}</h2>
          <p className="text-xs text-white/70 mt-0.5">{formatRupiah(popup.job_price)}</p>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-turquoise-light text-turquoise-dark flex items-center justify-center font-display font-bold overflow-hidden shrink-0">
              {popup.worker_avatar ? (
                <img src={popup.worker_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                popup.worker_name?.[0]?.toUpperCase() ?? "?"
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{popup.worker_name}</p>
              {popup.worker_kyc_status === "terverifikasi" && (
                <p className="text-xs text-turquoise flex items-center gap-1">
                  <BadgeCheck size={13} /> Identitas terverifikasi
                </p>
              )}
              {popup.worker_rating_count > 0 && (
                <p className="text-xs text-ink/50 flex items-center gap-1 mt-0.5">
                  <Star size={12} className="fill-gold text-gold" />
                  {Number(popup.worker_rating_avg).toFixed(1)} ({popup.worker_rating_count} ulasan) &middot;{" "}
                  {popup.worker_completed_jobs_count} pekerjaan selesai
                </p>
              )}
            </div>
          </div>

          {popup.photo_urls.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPhotos((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-ink/50 mb-2"
              >
                Bukti hasil pekerjaan ({popup.photo_urls.length} foto)
                {showPhotos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPhotos && (
                <div className="grid grid-cols-3 gap-1.5">
                  {popup.photo_urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden bg-paper">
                      <img src={url} alt="Hasil pekerjaan" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {popup.conversation_id && (
            <button
              onClick={() => router.push(`/chat/${popup.conversation_id}`)}
              className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-turquoise-dark py-2 rounded-xl bg-turquoise-light/60"
            >
              <MessageCircle size={15} /> Tanya pekerja dulu lewat chat
            </button>
          )}

          {!showRevision ? (
            <>
              <div className="mt-4">
                <label className="label">Beri Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`text-2xl ${n <= rating ? "text-gold-dark" : "text-line"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <label className="label">Ulasan (opsional)</label>
                <textarea className="input min-h-[70px]" value={review} onChange={(e) => setReview(e.target.value)} />
              </div>

              {error && <p className="text-sm text-clay mt-3">{error}</p>}

              <div className="space-y-2.5 mt-4">
                <button onClick={handleApprove} disabled={processing} className="btn-primary w-full !py-2.5 text-sm">
                  {processing ? "Memproses..." : "Setujui Pekerjaan"}
                </button>
                <button onClick={() => setShowRevision(true)} disabled={processing} className="btn-secondary w-full !py-2.5 text-sm">
                  Minta Revisi
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <label className="label">Catatan Revisi</label>
                <textarea
                  className="input min-h-[80px]"
                  placeholder="Jelaskan apa yang perlu diperbaiki..."
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-clay mt-3">{error}</p>}

              <div className="space-y-2.5 mt-4">
                <button onClick={handleRevision} disabled={processing} className="btn-gold w-full !py-2.5 text-sm">
                  {processing ? "Mengirim..." : "Kirim Permintaan Revisi"}
                </button>
                <button onClick={() => setShowRevision(false)} disabled={processing} className="btn-secondary w-full !py-2.5 text-sm">
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
