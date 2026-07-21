import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusStepper";
import { notFound } from "next/navigation";
import { MapPin, Clock, ShieldCheck } from "lucide-react";
import ApplyButton from "./ApplyButton";
import ChatInquiryButton from "@/components/ChatInquiryButton";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default async function JobDetailPage({ params }: { params: { jobid: string } }) {
  const supabase = createClient();
  const { data: job } = await supabase.from("jobs").select("*, profiles!jobs_employer_id_fkey(full_name, avatar_url, kyc_status)").eq("id", params.jobid).single();

  if (!job) notFound();

  const employer = (job as any).profiles;
  const isWorkerListing = job.posted_by_role === "worker";

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-turquoise uppercase tracking-wide">
            {job.category}
          </span>
          {isWorkerListing && (
            <span className="badge-stage bg-gold-light text-gold-dark text-[10px]">Menawarkan Jasa</span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3 mt-1">
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink leading-snug">
            {job.title}
          </h1>
          <StatusBadge stage={job.stage} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/60">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} /> {job.is_remote ? "Remote" : job.location}
          </span>
          {job.latitude && job.longitude && (
            <a
              href={`https://www.google.com/maps?q=${job.latitude},${job.longitude}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 font-semibold text-turquoise"
            >
              <MapPin size={15} /> Lihat Lokasi
            </a>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={15} /> {job.estimated_duration}
          </span>
        </div>

        <div className="card p-5 mt-6">
          <span className="font-display text-3xl font-semibold text-gold-dark">
            {formatRupiah(job.price)}
          </span>
          <p className="text-sm text-ink/50 mt-1">
            {isWorkerListing
              ? "Dana sudah aman ditahan platform begitu kerja sama disepakati — cair setelah pekerjaan selesai."
              : "Dana sudah aman ditahan platform begitu pekerja diterima — cair setelah pekerjaan selesai."}
          </p>
        </div>

        <div className="card p-5 mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">Deskripsi</h2>
          <p className="text-ink/70 whitespace-pre-line leading-relaxed">{job.description}</p>
        </div>

        {employer && (
          <div className="card p-5 mt-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-turquoise-light flex items-center justify-center font-display font-semibold text-turquoise-dark">
              {employer.full_name?.[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">{employer.full_name}</p>
              {employer.kyc_status === "terverifikasi" && (
                <p className="text-xs text-turquoise inline-flex items-center gap-1">
                  <ShieldCheck size={13} /> Identitas terverifikasi
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <ChatInquiryButton
            kind="job"
            refId={job.id}
            ownerId={job.employer_id}
            label={isWorkerListing ? "Tanya Dulu Sebelum Ajak Kerja Sama" : "Tanya Dulu Sebelum Melamar"}
          />
          <ApplyButton jobId={job.id} jobStage={job.stage} isWorkerListing={isWorkerListing} />
        </div>
      </div>
    </div>
  );
}
