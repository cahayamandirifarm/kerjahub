"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!confirm("Terima pelamar ini?")) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("accept_applicant", { p_application_id: applicationId });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const escrowId: string | undefined = row?.escrow_id;
    const payerId: string | undefined = row?.payer_id;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (payerId && user && payerId === user.id) {
      // Yang klik terima adalah pihak yang wajib bayar (kasus lowongan kerja biasa)
      router.push(`/dashboard/employer/escrow/${escrowId}`);
    } else {
      // Yang klik terima BUKAN pihak yang bayar (kasus postingan jasa/mencari kerja
      // -- pihak yang tertarik/melamar yang wajib bayar). Jangan arahkan ke halaman
      // pembayaran, cukup beri tahu dan kembali ke dasbor.
      alert(
        "Lamaran diterima! Pihak yang tertarik akan menerima notifikasi untuk melakukan pembayaran escrow. Kamu akan dinotifikasi begitu dana diamankan."
      );
      router.push(`/dashboard/employer`);
    }
    router.refresh();
  }

  return (
    <button onClick={handleAccept} disabled={loading} className="btn-primary !px-3 !py-1.5 text-xs">
      {loading ? "Memproses..." : "Terima Pelamar"}
    </button>
  );
}
