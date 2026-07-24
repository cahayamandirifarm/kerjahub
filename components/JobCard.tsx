import Link from "next/link";
import { Job } from "@/lib/types";
import StatusBadge from "./StatusStepper";
import { MapPin, Clock, ArrowUpRight, Star, CheckCircle2, Eye } from "lucide-react";
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
function formatJobPrice(job: Job) {
  return job.is_nego ? "NEGO" : formatRupiah(job.price);
}
export default function JobCard({ job }: { job: Job }) {
  const poster = job.profiles;
  const isTopRated = !!poster && poster.rating_count > 0 && poster.rating_avg >= 4.5;
  const isPopular = (job.view_count ?? 0) >= 20;
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="card group block p-4 hover:-translate-y-1 hover:shadow-soft transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
              {job.category}
            </span>
            {job.posted_by_role === "worker" && (
              <span className="badge-escrow text-[10px]">Menawarkan Jasa</span>
            )}
            {isTopRated && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold-dark bg-gold-light rounded-pill px-1.5 py-0.5">
                <Star size={10} className="fill-current" /> Rating Tinggi
              </span>
            )}
            {isPopular && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-turquoise-dark bg-turquoise-light rounded-pill px-1.5 py-0.5">
                🔥 Populer
              </span>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold text-ink mt-1 leading-snug line-clamp-2">
            {job.title}
          </h3>
        </div>
        <StatusBadge stage={job.stage} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink/55">
        <span className="inline-flex items-center gap-1">
          <MapPin size={14} /> {job.is_remote ? "Remote" : job.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={14} /> {job.estimated_duration}
        </span>
      </div>
      {poster && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/50">
          <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
            <Star size={12} className="text-gold-dark fill-gold-dark" />
            {poster.rating_count > 0 ? poster.rating_avg.toFixed(1) : "Baru"} · {poster.full_name}
          </span>
          {poster.completed_jobs_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={12} /> {poster.completed_jobs_count} selesai
            </span>
          )}
          {!!job.view_count && (
            <span className="inline-flex items-center gap-1">
              <Eye size={12} /> {job.view_count}x dilihat
            </span>
          )}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-line/70 flex items-center justify-between">
        <span className="font-display text-xl font-bold text-ink">
          {formatJobPrice(job)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise-dark group-hover:gap-1.5 transition-all">
          Detail <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}
