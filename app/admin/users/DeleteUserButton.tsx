"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteUserButton({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const ok = confirm(
      `Hapus permanen akun "${username}"?\n\nSemua data pengguna ini (profil, riwayat, dsb) akan dihapus dari database dan TIDAK BISA dikembalikan.`
    );
    if (!ok) return;

    setLoading(true);
    const { error } = await supabase.rpc("admin_delete_user_permanent", { p_user_id: userId });
    setLoading(false);

    if (error) {
      // Fungsi menolak (misalnya masih punya saldo/riwayat transaksi) --
      // pesannya sudah dibuat jelas & dalam Bahasa Indonesia di database.
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={handleDelete} disabled={loading} className="text-xs font-semibold text-clay">
      {loading ? "Menghapus..." : "Hapus Permanen"}
    </button>
  );
}
