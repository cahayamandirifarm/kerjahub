import { JobStage, STAGE_LABEL } from "@/lib/types";

const CLASS_MAP: Record<JobStage, string> = {
  terbuka: "stage-terbuka",
  diterima: "stage-dibayar",
  menunggu_pembayaran: "stage-dibayar",
  menunggu_konfirmasi_admin: "stage-dibayar",
  dana_diamankan: "stage-dikerjakan",
  dikerjakan: "stage-dikerjakan",
  menunggu_konfirmasi_selesai: "stage-dikerjakan",
  revisi: "bg-clay/10 text-clay",
  selesai: "stage-selesai",
  dibatalkan: "bg-clay/10 text-clay"
};

export default function StatusBadge({ stage }: { stage: JobStage }) {
  return <span className={`badge-stage ${CLASS_MAP[stage] ?? "stage-terbuka"}`}>{STAGE_LABEL[stage] ?? stage}</span>;
}
