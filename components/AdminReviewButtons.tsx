"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AdminTxReviewButtons({
  txId,
  rpcName,
  idParam = "p_tx_id"
}: {
  txId: string;
  rpcName: "admin_review_deposit" | "admin_review_withdrawal" | "admin_confirm_escrow";
  idParam?: "p_tx_id" | "p_escrow_id";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function review(approve: boolean) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { error } = await supabase.rpc(rpcName, { [idParam]: txId, p_approve: approve, p_admin_id: user?.id });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => review(true)} disabled={loading} className="btn-primary !px-3 !py-1.5 text-xs">
        Setujui
      </button>
      <button onClick={() => review(false)} disabled={loading} className="btn-secondary !px-3 !py-1.5 text-xs">
        Tolak
      </button>
    </div>
  );
}

export function AdminKycReviewButtons({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function review(approve: boolean) {
    setLoading(true);
    const supabase = createClient();
    const reason = approve ? null : prompt("Alasan penolakan?") || "Dokumen tidak valid";
    const { error } = await supabase
      .from("profiles")
      .update({
        kyc_status: approve ? "terverifikasi" : "ditolak",
        kyc_rejected_reason: approve ? null : reason
      })
      .eq("id", profileId);
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => review(true)} disabled={loading} className="btn-primary !px-3 !py-1.5 text-xs">
        Verifikasi
      </button>
      <button onClick={() => review(false)} disabled={loading} className="btn-secondary !px-3 !py-1.5 text-xs">
        Tolak
      </button>
    </div>
  );
}
