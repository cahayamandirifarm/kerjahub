import Link from "next/link";
import { Job } from "@/lib/types";
import StatusBadge from "./StatusStepper";
import { MapPin, Clock, ArrowUpRight } from "lucide-react";
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
export default function JobCard({ job }: { job: Job }) {
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
      <div className="mt-3 pt-3 border-t border-line/70 flex items-center justify-between">
        <span className="font-display text-xl font-bold text-ink">
          {formatRupiah(job.price)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise-dark group-hover:gap-1.5 transition-all">
          Detail <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}
