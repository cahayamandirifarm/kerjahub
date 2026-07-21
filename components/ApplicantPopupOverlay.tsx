"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApplicantPopup } from "@/lib/ApplicantPopupContext";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { X, Star, BadgeCheck, Briefcase, ChevronDown, ChevronUp, UserRound } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function ApplicantPopupOverlay() {
  const { popup, loading, processing, dismiss, accept, reject } = useApplicantPopup();
  const { activeJob } = useActiveJobLock();
  const pathname = usePathname();
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !popup) return null;
  // Jangan tabrakan dengan overlay job aktif yang sudah mengunci app,
  // dan jangan muncul di halaman login/register/admin.
  if (activeJob) return null;
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;

  const isJasaPost = popup.posted_by_role === "worker";
  const headline = isJasaPost ? "Ada yang tertarik dengan jasamu!" : "Ada pelamar baru!";

  async function handleClose() {
    setShowProfile(false);
    await dismiss();
  }

  async function handleAccept() {
    setError(null);
    if (!confirm(`Terima ${popup!.applicant_name} untuk "${popup!.job_title}"?`)) return;
    const res = await accept();
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowProfile(false);
    // Kalau yang klik terima adalah pihak yang wajib bayar escrow,
    // arahkan langsung ke halaman pembayaran -- sama seperti tombol
    // "Terima Pelamar" di halaman daftar pelamar.
    if (res.escrowId && res.payerId) {
      router.push(`/dashboard/employer/escrow/${res.escrowId}`);
    }
  }

  async function handleReject() {
    setError(null);
    if (!confirm(`Tolak lamaran dari ${popup!.applicant_name}?`)) return;
    const res = await reject();
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowProfile(false);
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
            <Briefcase size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">{headline}</span>
          </div>
          <h2 className="text-lg font-extrabold leading-snug">{popup.job_title}</h2>
          <p className="text-xs text-white/70 mt-0.5">{formatRupiah(popup.job_price)}</p>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-turquoise-light text-turquoise-dark flex items-center justify-center font-display font-bold overflow-hidden shrink-0">
              {popup.applicant_avatar ? (
                <img src={popup.applicant_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                popup.applicant_name?.[0]?.toUpperCase() ?? "?"
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{popup.applicant_name}</p>
              {popup.applicant_kyc_status === "terverifikasi" && (
                <p className="text-xs text-turquoise flex items-center gap-1">
                  <BadgeCheck size={13} /> Identitas terverifikasi
                </p>
              )}
              {popup.applicant_rating_count > 0 && (
                <p className="text-xs text-ink/50 flex items-center gap-1 mt-0.5">
                  <Star size={12} className="fill-gold text-gold" />
                  {Number(popup.applicant_rating_avg).toFixed(1)} ({popup.applicant_rating_count} ulasan) &middot;{" "}
                  {popup.applicant_completed_jobs_count} pekerjaan selesai
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowProfile((v) => !v)}
            className="w-full mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-turquoise-dark py-2 rounded-xl bg-turquoise-light/60"
          >
            <UserRound size={15} />
            Lihat Pelamar
            {showProfile ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showProfile && (
            <div className="mt-3 space-y-3 text-sm">
              {popup.message && (
                <div>
                  <p className="text-xs font-semibold text-ink/40 mb-1">Pesan lamaran</p>
                  <p className="text-ink/70 bg-paper rounded-xl p-3">{popup.message}</p>
                </div>
              )}
              {popup.applicant_bio && (
                <div>
                  <p className="text-xs font-semibold text-ink/40 mb-1">Tentang</p>
                  <p className="text-ink/70">{popup.applicant_bio}</p>
                </div>
              )}
              {popup.applicant_skills && popup.applicant_skills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink/40 mb-1.5">Keahlian</p>
                  <div className="flex flex-wrap gap-1.5">
                    {popup.applicant_skills.map((s) => (
                      <span key={s} className="text-xs bg-turquoise-light text-turquoise-dark rounded-full px-2 py-1">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!popup.applicant_bio && (!popup.applicant_skills || popup.applicant_skills.length === 0) && !popup.message && (
                <p className="text-xs text-ink/40 text-center py-2">Pelamar belum melengkapi profilnya.</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-clay mt-3">{error}</p>}

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleReject}
              disabled={processing}
              className="btn-secondary flex-1 !py-2.5 text-sm"
            >
              Tolak Pelamar
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              className="btn-primary flex-1 !py-2.5 text-sm"
            >
              {processing ? "Memproses..." : "Terima Pelamar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
