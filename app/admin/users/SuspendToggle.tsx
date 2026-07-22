"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "../_components/ConfirmModal";

export default function SuspendToggle({ userId, isSuspended }: { userId: string; isSuspended: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await supabase.from("profiles").update({ is_suspended: !isSuspended }).eq("id", userId);
    await supabase.rpc("write_audit", {
      p_action: isSuspended ? "unsuspend_user" : "suspend_user",
      p_entity: "profiles",
      p_entity_id: userId,
      p_meta: {}
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-turquoise">
        {isSuspended ? "Aktifkan" : "Tangguhkan"}
      </button>

      {open && (
        <ConfirmModal
          title={isSuspended ? "Aktifkan Akun" : "Tangguhkan Akun"}
          description={
            isSuspended
              ? "Akun ini akan bisa login dan menggunakan platform lagi seperti biasa."
              : "Akun ini tidak akan bisa login sampai kamu aktifkan kembali."
          }
          confirmLabel={loading ? "Memproses..." : isSuspended ? "Ya, Aktifkan" : "Ya, Tangguhkan"}
          confirmVariant={isSuspended ? "primary" : "danger"}
          loading={loading}
          onConfirm={toggle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
