"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "../_components/ConfirmModal";

export default function DeleteUserButton({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("admin_delete_user_permanent", { p_user_id: userId });
    setLoading(false);

    if (error) {
      // Fungsi menolak (misalnya masih punya saldo/riwayat transaksi) --
      // pesannya sudah dibuat jelas & dalam Bahasa Indonesia di database.
      setError(error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-clay">
        Hapus Permanen
      </button>

      {open && (
        <ConfirmModal
          title="Hapus Permanen Akun"
          description={`Semua data akun "${username}" (profil, riwayat, dsb) akan dihapus dari database dan TIDAK BISA dikembalikan.`}
          confirmLabel={loading ? "Menghapus..." : "Ya, Hapus Permanen"}
          confirmVariant="danger"
          loading={loading}
          onConfirm={handleDelete}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {error && <p className="text-sm text-clay">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
