"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JobStatusButtons({ jobId, isActive }: { jobId: string; isActive: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function toggleActive() {
    setLoading(true);
    await supabase.from("jobs").update({ is_active: !isActive }).eq("id", jobId);
    setLoading(false);
    router.refresh();
  }

  async function deletePermanent() {
    if (!confirm("Hapus permanen postingan ini? Tindakan tidak bisa dibatalkan.")) return;
    setLoading(true);
    await supabase.from("jobs").delete().eq("id", jobId);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button onClick={toggleActive} disabled={loading} className="text-xs font-semibold text-forest">
        {isActive ? "Nonaktifkan" : "Aktifkan"}
      </button>
      <button onClick={deletePermanent} disabled={loading} className="text-xs font-semibold text-clay">
        Hapus Permanen
      </button>
    </div>
  );
}
