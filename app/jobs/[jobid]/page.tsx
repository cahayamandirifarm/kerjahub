import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import StatusBadge from "@/components/StatusStepper";
import { notFound } from "next/navigation";
import { MapPin, Clock, ShieldCheck, Star, CheckCircle2, Eye } from "lucide-react";
import Link from "next/link";
import ApplyButton from "./ApplyButton";
import ChatInquiryButton from "@/components/ChatInquiryButton";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default async function JobDetailPage({ params }: { params: { jobid: string } }) {
  const supabase = createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("*, profiles!jobs_employer_id_fkey(id, full_name, avatar_url, kyc_status, rating_avg, rating_count, completed_jobs_count)")
    .eq("id", params.jobid)
    .single();

  if (!job) notFound();

  // Catat 1 view -- tidak perlu ditunggu, kegagalan diabaikan supaya
  // tidak menghambat render halaman.
  supabase.rpc("increment_job_views", { p_job_id: params.jobid }).then(() => {});

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
          {job.is_nego && (
            <span className="badge-stage bg-turquoise-light text-turquoise-dark text-[10px]">Harga Nego</span>
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
          {!!job.view_count && (
            <span className="inline-flex items-center gap-1.5">
              <Eye size={15} /> {job.view_count}x dilihat
            </span>
          )}
        </div>

        <div className="card p-5 mt-6">
          {job.is_nego ? (
            <>
              <span className="font-display text-2xl font-semibold text-gold-dark">Harga Nego</span>
              <p className="text-sm text-ink/50 mt-1">
                Perkiraan awal {formatRupiah(job.price)}. Harga akhir ditentukan lewat chat — tanyakan & sepakati harga dengan{" "}
                {isWorkerListing ? "pekerja" : "pemberi kerja"} sebelum membayar.
              </p>
            </>
          ) : (
            <>
              <span className="font-display text-3xl font-semibold text-gold-dark">
                {formatRupiah(job.price)}
              </span>
              <p className="text-sm text-ink/50 mt-1">
                {isWorkerListing
                  ? "Dana sudah aman ditahan platform begitu kerja sama disepakati — cair setelah pekerjaan selesai."
                  : "Dana sudah aman ditahan platform begitu pekerja diterima — cair setelah pekerjaan selesai."}
              </p>
            </>
          )}
        </div>

        <div className="card p-5 mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">Deskripsi</h2>
          <p className="text-ink/70 whitespace-pre-line leading-relaxed">{job.description}</p>
        </div>

        {employer && (
          <Link
            href={`/profil/${employer.id}`}
            className="card p-5 mt-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-soft transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-full bg-turquoise-light flex items-center justify-center font-display font-semibold text-turquoise-dark shrink-0">
              {employer.full_name?.[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">{employer.full_name}</p>
              <div className="flex items-center gap-3 flex-wrap mt-0.5">
                <p className="text-xs text-ink/50 inline-flex items-center gap-1">
                  <Star size={13} className="text-gold-dark fill-gold-dark" />
                  {employer.rating_count > 0 ? `${employer.rating_avg?.toFixed(1)} (${employer.rating_count} ulasan)` : "Belum ada rating"}
                </p>
                {employer.completed_jobs_count > 0 && (
                  <p className="text-xs text-ink/50 inline-flex items-center gap-1">
                    <CheckCircle2 size={13} /> {employer.completed_jobs_count} selesai
                  </p>
                )}
              </div>
              {employer.kyc_status === "terverifikasi" && (
                <p className="text-xs text-turquoise inline-flex items-center gap-1 mt-0.5">
                  <ShieldCheck size={13} /> Identitas terverifikasi
                </p>
              )}
              <p className="text-xs font-semibold text-turquoise-dark mt-1">Lihat profil &amp; postingan lain →</p>
            </div>
          </Link>
        )}

        <div className="mt-6 space-y-3">
          <ChatInquiryButton
            kind="job"
            refId={job.id}
            ownerId={job.employer_id}
            label={
              job.is_nego
                ? "Chat & Tanya Harga"
                : isWorkerListing
                ? "Tanya Dulu Sebelum Ajak Kerja Sama"
                : "Tanya Dulu Sebelum Melamar"
            }
          />
          {job.is_nego ? (
            job.stage === "terbuka" ? (
              <p className="text-xs text-center text-ink/45">
                Postingan ini memakai harga Nego — ajukan tawaran harga lewat chat di atas, bukan lamaran langsung.
              </p>
            ) : (
              <div className="card p-4 text-center text-sm text-ink/50">
                {isWorkerListing ? "Tawaran jasa ini sudah tidak menerima nego." : "Pekerjaan ini sudah tidak menerima nego."}
              </div>
            )
          ) : (
            <ApplyButton jobId={job.id} jobStage={job.stage} ownerId={job.employer_id} isWorkerListing={isWorkerListing} />
          )}
        </div>
      </div>
    </div>
  );
}
