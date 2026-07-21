"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, EyeOff, Eye } from "lucide-react";

export default function BankAccountActions({
  id,
  bankName,
  isActive
}: {
  id: string;
  bankName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("bank_accounts").update({ is_active: !isActive }).eq("id", id);
    setBusy(false);
    if (updateError) {
      setError("Gagal mengubah status.");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Hapus rekening "${bankName}" secara permanen?\n\nKalau rekening ini pernah dipakai untuk transaksi escrow, penghapusan akan gagal -- nonaktifkan saja sebagai gantinya.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from("bank_accounts").delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      setError("Tidak bisa dihapus permanen karena rekening ini sudah pernah dipakai untuk transaksi. Coba nonaktifkan saja.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 text-sm">
        <button type="button" onClick={toggleActive} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-ink/60 disabled:opacity-60">
          {isActive ? <EyeOff size={14} /> : <Eye size={14} />} {isActive ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button type="button" onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-clay disabled:opacity-60">
          <Trash2 size={14} /> Hapus
        </button>
      </div>
      {error && <p className="text-xs text-clay max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
