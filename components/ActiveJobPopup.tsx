"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ACTIVE_JOB_STAGES, STAGE_LABEL, type JobStage } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { X, MessageCircle, Phone, Briefcase } from "lucide-react";

interface ActiveJob {
  id: string;
  title: string;
  category: string;
  stage: JobStage;
  counterpartName: string | null;
  counterpartPhone: string | null;
  counterpartRole: "Pemberi kerja" | "Pekerja";
  conversationId: string | null;
}

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function ActiveJobPopup() {
  const [jobs, setJobs] = useState<ActiveJob[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;

      const [asWorker, asEmployer] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, category, stage, price, employer:profiles!jobs_employer_id_fkey(full_name, phone)")
          .eq("assigned_worker_id", user.id)
          .in("stage", ACTIVE_JOB_STAGES),
        supabase
          .from("jobs")
          .select("id, title, category, stage, price, worker:profiles!jobs_assigned_worker_id_fkey(full_name, phone)")
          .eq("employer_id", user.id)
          .in("stage", ACTIVE_JOB_STAGES)
      ]);

      const jobIds = [...(asWorker.data ?? []), ...(asEmployer.data ?? [])].map((j: any) => j.id);
      const { data: conversations } =
        jobIds.length > 0 ? await supabase.from("conversations").select("id, job_id").in("job_id", jobIds) : { data: [] };

      const convByJob = new Map((conversations ?? []).map((c: any) => [c.job_id, c.id]));

      const workerJobs: ActiveJob[] = (asWorker.data ?? []).map((j: any) => ({
        id: j.id,
        title: j.title,
        category: j.category,
        stage: j.stage,
        counterpartName: j.employer?.full_name ?? null,
        counterpartPhone: j.employer?.phone ?? null,
        counterpartRole: "Pemberi kerja",
        conversationId: convByJob.get(j.id) ?? null
      }));
      const employerJobs: ActiveJob[] = (asEmployer.data ?? []).map((j: any) => ({
        id: j.id,
        title: j.title,
        category: j.category,
        stage: j.stage,
        counterpartName: j.worker?.full_name ?? null,
        counterpartPhone: j.worker?.phone ?? null,
        counterpartRole: "Pekerja",
        conversationId: convByJob.get(j.id) ?? null
      }));

      const all = [...workerJobs, ...employerJobs];
      setJobs(all);
      if (all.length > 0) {
        // Tampilkan otomatis begitu dasbor dibuka, selama masih ada
        // pekerjaan yang sudah dibayar & belum selesai/dibatalkan.
        setOpen(true);
      }
    })();
  }, []);

  if (!jobs || jobs.length === 0) return null;

  return (
    <>
      {/* Chip mengambang -- tetap bisa dibuka lagi kapan pun setelah popup ditutup,
          jadi info pekerjaan aktif & jalur chat/WhatsApp selalu mudah dijangkau
          selama pekerjaan belum selesai. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-4 z-[150] bg-turquoise-dark text-paper rounded-full shadow-lg px-4 py-3 flex items-center gap-2 text-sm font-semibold"
        >
          <Briefcase size={16} />
          {jobs.length} Pekerjaan Aktif
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[200] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h2 className="font-display text-lg font-semibold">Pekerjaan Aktif</h2>
                <p className="text-xs text-ink/50">Pembayaran sudah dikonfirmasi. Tetap komunikasi lewat chat / WhatsApp.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink/70">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {jobs.map((job) => {
                const wa = waLink(
                  job.counterpartPhone,
                  `Halo ${job.counterpartName ?? ""}, terkait pekerjaan "${job.title}" ya.`
                );
                return (
                  <div key={job.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-turquoise uppercase">{job.category}</span>
                        <h3 className="font-semibold text-ink truncate">{job.title}</h3>
                      </div>
                      <span className="badge-stage stage-dikerjakan shrink-0">{STAGE_LABEL[job.stage]}</span>
                    </div>
                    <p className="text-sm text-ink/60 mt-1">
                      {job.counterpartRole}: {job.counterpartName ?? "-"}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Link
                        href={job.conversationId ? `/chat/${job.conversationId}` : "/chat"}
                        className="btn-secondary !py-2 text-sm inline-flex items-center justify-center gap-1.5"
                      >
                        <MessageCircle size={15} /> Buka Chat
                      </Link>
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full text-sm font-semibold py-2 inline-flex items-center justify-center gap-1.5"
                          style={{ backgroundColor: "#25D366", color: "#ffffff" }}
                        >
                          <Phone size={15} /> WhatsApp
                        </a>
                      ) : (
                        <span className="rounded-full text-sm font-medium py-2 inline-flex items-center justify-center gap-1.5 bg-line/50 text-ink/40">
                          <Phone size={15} /> No. tidak ada
                        </span>
                      )}
                    </div>
                    <Link href={`/dashboard/job/${job.id}`} className="block text-center text-xs font-semibold text-turquoise mt-3">
                      Lihat Detail Pekerjaan
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
