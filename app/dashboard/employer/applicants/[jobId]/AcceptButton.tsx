"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!confirm("Terima pelamar ini? Kamu akan diarahkan untuk melakukan pembayaran escrow ke platform.")) return;
    setLoading(true);
    const supabase = createClient();
    const { data: escrowId, error } = await supabase.rpc("accept_applicant", { p_application_id: applicationId });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push(`/dashboard/employer/escrow/${escrowId}`);
  }

  return (
    <button onClick={handleAccept} disabled={loading} className="btn-primary !px-3 !py-1.5 text-xs">
      {loading ? "Memproses..." : "Terima Pelamar"}
    </button>
  );
}
