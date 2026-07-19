import Link from "next/link";
import { Job } from "@/lib/types";
import StatusBadge from "./StatusStepper";
import { MapPin, Clock, Briefcase } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="card block p-4 hover:-translate-y-0.5 hover:shadow-lg transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-forest uppercase tracking-wide">
              {job.category}
            </span>
            {job.posted_by_role === "worker" && (
              <span className="badge-stage bg-gold-light text-gold-dark text-[10px]">Menawarkan Jasa</span>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold text-ink mt-0.5 leading-snug line-clamp-2">
            {job.title}
          </h3>
        </div>
        <StatusBadge stage={job.stage} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink/60">
        <span className="inline-flex items-center gap-1">
          <MapPin size={14} /> {job.is_remote ? "Remote" : job.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={14} /> {job.estimated_duration}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-display text-xl font-semibold text-gold-dark">
          {formatRupiah(job.price)}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
          <Briefcase size={14} /> Lihat detail
        </span>
      </div>
    </Link>
  );
}
