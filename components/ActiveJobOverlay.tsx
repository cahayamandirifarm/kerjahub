"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { STAGE_LABEL, JobStage } from "@/lib/types";
import { MessageCircle, Briefcase, ExternalLink, ClipboardList, Wallet, AlertTriangle } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

/**
 * Rute yang TETAP boleh diakses walau ada job aktif yang mengunci app:
 *  - halaman chat percakapan job tsb (komunikasi intens)
 *  - halaman kelola/status job tsb (submit/approve pekerjaan) — supaya
 *    job tetap bisa diproses sampai selesai
 *  - halaman pembayaran escrow job tsb (supaya form unggah bukti transfer
 *    tetap bisa dipakai walau app sedang terkunci menunggu pembayaran)
 */
function isAllowedWhileLocked(pathname: string, job: { conversation_id: string | null; job_id: string; escrow_id: string | null }) {
  if (job.conversation_id && pathname === `/chat/${job.conversation_id}`) return true;
  if (pathname === `/dashboard/job/${job.job_id}`) return true;
  if (job.escrow_id && pathname === `/dashboard/employer/escrow/${job.escrow_id}`) return true;
  return false;
}

function waLink(phone: string | null, jobTitle: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : "62" + digits;
  const text = encodeURIComponent(`Halo, terkait pekerjaan "${jobTitle}" di KerjaHub.`);
  return `https://wa.me/${normalized}?text=${text}`;
}

export default function ActiveJobOverlay() {
  const { activeJob, loading, cancelling, cancelPendingPayment } = useActiveJobLock();
  const pathname = usePathname();
  const router = useRouter();
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (loading || !activeJob) return null;
  // halaman login/register dll tidak boleh ikut dikunci
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;

  const allowed = isAllowedWhileLocked(pathname, activeJob);
  const wa = waLink(activeJob.other_phone, activeJob.title);
  const roleLabel = activeJob.my_role === "employer" ? "Pekerja" : "Pemberi Kerja";

  // ---------- Stage khusus: MENUNGGU PEMBAYARAN ----------
  const isPendingPayment = activeJob.stage === "menunggu_pembayaran";
  const isPayer = isPendingPayment && activeJob.my_role === "employer";
  const canStillCancel = isPayer && (activeJob.escrow_status === "menunggu_pembayaran" || activeJob.escrow_status === "ditolak");

  async function handleCancel() {
    setCancelError(null);
    if (!confirm(`Batalkan pembayaran untuk "${activeJob!.title}"? Kerja sama ini akan dibatalkan.`)) return;
    const res = await cancelPendingPayment();
    if (res.error) {
      setCancelError(res.error);
      return;
    }
    // Setelah dibatalkan, langsung kembali ke dasbor awal alih-alih
    // membiarkan overlay hilang begitu saja dan menampilkan halaman apa
    // pun yang sedang dibuka di baliknya.
    router.push("/dashboard/employer");
  }

  if (isPayer && !allowed) {
    // Pop-up kunci penuh khusus untuk pihak PEMBAYAR: hanya bisa bayar
    // atau membatalkan, semua menu lain di app terkunci.
    return (
      <div className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
          <div className="flex items-center gap-2 text-gold-dark mb-1">
            <Wallet size={18} />
            <span className="text-xs font-bold uppercase tracking-wide">Selesaikan Pembayaran</span>
          </div>
          <h2 className="text-lg font-extrabold text-ink leading-snug mb-1">{activeJob.title}</h2>
          <p className="text-sm text-ink/60 mb-4">
            Kerja sama dengan <span className="font-semibold text-ink">{activeJob.other_name || "Tanpa nama"}</span> ({roleLabel.toLowerCase()}) sudah disetujui — selesaikan pembayaran untuk mengamankan dana ke platform.
          </p>

          <div className="card p-4 bg-gold/10 border border-gold/30 mb-4 text-center">
            {activeJob.wallet_deducted ? (
              <>
                <p className="text-xs text-ink/50">
                  {formatRupiah(activeJob.wallet_deducted)} sudah terpotong dari saldo. Sisa yang wajib ditransfer:
                </p>
                <p className="font-display text-3xl font-semibold text-gold-dark mt-1">
                  {formatRupiah(activeJob.total_amount || 0)}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-ink/50">Total yang wajib dibayar</p>
                <p className="font-display text-3xl font-semibold text-gold-dark mt-1">
                  {formatRupiah(activeJob.total_amount || activeJob.price)}
                </p>
              </>
            )}
          </div>

          {activeJob.escrow_status === "menunggu_konfirmasi_admin" ? (
            <div className="flex items-start gap-2 bg-turquoise/10 border border-turquoise/30 rounded-xl p-3 mb-5 text-xs text-ink/70">
              <AlertTriangle size={15} className="text-turquoise-dark shrink-0 mt-0.5" />
              Bukti transfer sudah dikirim, menunggu verifikasi admin. Menu lain tetap terkunci sampai dikonfirmasi.
            </div>
          ) : (
            <p className="text-xs text-ink/50 mb-5 text-center leading-relaxed">
              Menu lain dikunci sementara sampai pembayaran ini <strong>diselesaikan</strong> atau <strong>dibatalkan</strong>.
            </p>
          )}

          {cancelError && <p className="text-sm text-clay mb-3 text-center">{cancelError}</p>}

          <div className="space-y-2.5">
            {activeJob.escrow_id && (
              <button
                onClick={() => router.push(`/dashboard/employer/escrow/${activeJob.escrow_id}`)}
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                <Wallet size={17} />
                {activeJob.escrow_status === "menunggu_konfirmasi_admin" ? "Lihat Status Pembayaran" : "Bayar Sekarang"}
              </button>
            )}

            {canStillCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
              >
                {cancelling ? "Membatalkan..." : "Batalkan"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isPendingPayment && activeJob.my_role === "worker" && !allowed) {
    // Pihak penerima kerja: cuma info, tidak ada aksi bayar/batalkan.
    return (
      <div className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
          <div className="flex items-center justify-center gap-2 text-gold-dark mb-1">
            <Wallet size={18} />
            <span className="text-xs font-bold uppercase tracking-wide">Menunggu Pembayaran</span>
          </div>
          <h2 className="text-lg font-extrabold text-ink leading-snug mb-1">{activeJob.title}</h2>
          <p className="text-sm text-ink/60 mb-5">
            Lamaranmu diterima! Menunggu <span className="font-semibold text-ink">{activeJob.other_name || "pihak lain"}</span> menyelesaikan pembayaran sebelum kerja sama dimulai. Menu lain terkunci sementara.
          </p>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              Chat via WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  if (allowed) {
    // Di halaman chat/kelola job/pembayaran yang diizinkan: tampilkan bar kecil
    // non-blocking sebagai pengingat, bukan overlay penuh, supaya tetap bisa
    // mengetik pesan, menekan tombol aksi job, atau mengisi form pembayaran.
    return (
      <div className="fixed top-0 inset-x-0 z-[90] bg-turquoise-dark text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 pt-[env(safe-area-inset-top)]">
        <Briefcase size={14} />
        Pekerjaan aktif: {activeJob.title} — {STAGE_LABEL[activeJob.stage as JobStage] ?? activeJob.stage}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-turquoise-dark mb-1">
          <Briefcase size={18} />
          <span className="text-xs font-bold uppercase tracking-wide">Pekerjaan Sedang Berlangsung</span>
        </div>
        <h2 className="text-lg font-extrabold text-ink leading-snug mb-1">{activeJob.title}</h2>
        <p className="text-sm text-ink/60 mb-4">
          Status: <span className="font-semibold text-turquoise-dark">{STAGE_LABEL[activeJob.stage as JobStage] ?? activeJob.stage}</span>
        </p>

        <div className="flex items-center gap-3 bg-mist rounded-2xl p-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-turquoise-dark text-white flex items-center justify-center font-bold overflow-hidden shrink-0">
            {activeJob.other_avatar ? (
              <img src={activeJob.other_avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (activeJob.other_name || "?").charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-ink/50 font-semibold">{roleLabel}</p>
            <p className="font-bold text-ink truncate">{activeJob.other_name || "Tanpa nama"}</p>
          </div>
        </div>

        <p className="text-xs text-ink/50 mb-5 text-center leading-relaxed">
          Menu lain dikunci sementara sampai pekerjaan ini <strong>selesai</strong> atau <strong>dibatalkan</strong>.
          Gunakan chat atau WhatsApp untuk koordinasi dengan {roleLabel.toLowerCase()}.
        </p>

        <div className="space-y-2.5">
          <button
            onClick={() => activeJob.conversation_id && router.push(`/chat/${activeJob.conversation_id}`)}
            disabled={!activeJob.conversation_id}
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
          >
            <MessageCircle size={17} />
            Buka Chat
          </button>

          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              Chat via WhatsApp
            </a>
          )}

          <button
            onClick={() => router.push(`/dashboard/job/${activeJob.job_id}`)}
            className="btn-secondary w-full inline-flex items-center justify-center gap-2"
          >
            <ClipboardList size={16} />
            Lihat & Kelola Detail Pekerjaan
          </button>
        </div>
      </div>
    </div>
  );
}
