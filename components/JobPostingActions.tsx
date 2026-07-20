"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Trash2, EyeOff, Eye } from "lucide-react";

export default function JobPostingActions({
  jobId,
  title,
  isActive,
  editable
}: {
  jobId: string;
  title: string;
  isActive: boolean;
  /** false kalau job sudah berjalan (bukan status "terbuka") -- edit dimatikan */
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("jobs").update({ is_active: !isActive }).eq("id", jobId);
    setBusy(false);
    if (updateError) {
      setError("Gagal mengubah status.");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    const ok = window.confirm(`Hapus postingan "${title}" secara permanen? Tindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("jobs").delete().eq("id", jobId);
    setBusy(false);
    if (deleteError) {
      setError("Tidak bisa dihapus permanen karena sudah ada riwayat transaksi/pelamar. Coba nonaktifkan saja.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {editable ? (
        <Link href={`/dashboard/job/${jobId}/edit`} className="inline-flex items-center gap-1 font-semibold text-turquoise">
          <Pencil size={14} /> Edit
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-ink/30" title="Sudah berjalan, tidak bisa diedit">
          <Pencil size={14} /> Edit
        </span>
      )}
      <button type="button" onClick={toggleActive} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-ink/60 disabled:opacity-60">
        {isActive ? <EyeOff size={14} /> : <Eye size={14} />} {isActive ? "Nonaktifkan" : "Aktifkan"}
      </button>
      <button type="button" onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-clay disabled:opacity-60">
        <Trash2 size={14} /> Hapus
      </button>
      {error && <p className="w-full text-xs text-clay">{error}</p>}
    </div>
  );
}
