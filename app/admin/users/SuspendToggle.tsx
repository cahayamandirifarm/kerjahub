"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SuspendToggle({ userId, isSuspended }: { userId: string; isSuspended: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!confirm(isSuspended ? "Aktifkan kembali akun ini?" : "Tangguhkan akun ini?")) return;
    setLoading(true);
    await supabase.from("profiles").update({ is_suspended: !isSuspended }).eq("id", userId);
    await supabase.rpc("write_audit", {
      p_action: isSuspended ? "unsuspend_user" : "suspend_user",
      p_entity: "profiles",
      p_entity_id: userId,
      p_meta: {}
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={toggle} disabled={loading} className="text-xs font-semibold text-turquoise">
      {isSuspended ? "Aktifkan" : "Tangguhkan"}
    </button>
  );
}
