"use client";
import { useRouter, usePathname } from "next/navigation";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { STAGE_LABEL, JobStage } from "@/lib/types";
import { MessageCircle, Briefcase, ExternalLink } from "lucide-react";

/**
 * Rute yang TETAP boleh diakses walau ada job aktif yang mengunci app:
 *  - halaman chat percakapan job tsb (komunikasi intens)
 *  - halaman kelola/status job tsb (submit/approve pekerjaan) — supaya
 *    job tetap bisa diproses sampai selesai
 */
function isAllowedWhileLocked(pathname: string, job: { conversation_id: string | null; job_id: string }) {
  if (job.conversation_id && pathname === `/chat/${job.conversation_id}`) return true;
  if (pathname === `/dashboard/job/${job.job_id}`) return true;
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
  const { activeJob, loading } = useActiveJobLock();
  const pathname = usePathname();
  const router = useRouter();

  if (loading || !activeJob) return null;
  // halaman login/register dll tidak boleh ikut dikunci
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/admin")) return null;

  const allowed = isAllowedWhileLocked(pathname, activeJob);
  const wa = waLink(activeJob.other_phone, activeJob.title);
  const roleLabel = activeJob.my_role === "employer" ? "Pekerja" : "Pemberi Kerja";

  if (allowed) {
    // Di halaman chat/kelola job yang diizinkan: tampilkan bar kecil non-blocking
    // sebagai pengingat, bukan overlay penuh, supaya tetap bisa mengetik pesan
    // atau menekan tombol aksi job.
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
            className="w-full text-center text-xs font-semibold text-ink/50 py-2"
          >
            Lihat & kelola detail pekerjaan →
          </button>
        </div>
      </div>
    </div>
  );
}
