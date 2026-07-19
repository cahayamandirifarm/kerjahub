"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ListingStatusButtons({ listingId, status }: { listingId: string; status: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function setStatus(newStatus: string) {
    if (newStatus === "dihapus" && !confirm("Hapus permanen listing ini?")) return;
    setLoading(true);
    await supabase.from("digital_listings").update({ status: newStatus }).eq("id", listingId);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "aktif" && status !== "terjual" && (
        <button onClick={() => setStatus("aktif")} disabled={loading} className="text-xs font-semibold text-turquoise">
          Aktifkan
        </button>
      )}
      {status === "aktif" && (
        <button onClick={() => setStatus("nonaktif")} disabled={loading} className="text-xs font-semibold text-ink/50">
          Nonaktifkan
        </button>
      )}
      <button onClick={() => setStatus("dihapus")} disabled={loading} className="text-xs font-semibold text-clay">
        Hapus
      </button>
    </div>
  );
}
