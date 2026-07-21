"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RejectButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReject() {
    if (!confirm("Tolak pelamar ini?")) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_applicant", { p_application_id: applicationId });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={handleReject}
      disabled={loading}
      className="!px-3 !py-1.5 text-xs font-semibold text-clay border border-clay/30 rounded-pill hover:bg-clay/5"
    >
      {loading ? "Memproses..." : "Tolak Pelamar"}
    </button>
  );
}
