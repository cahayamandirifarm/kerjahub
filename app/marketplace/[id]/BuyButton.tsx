"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BuyButton({ listingId, status }: { listingId: string; status: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleBuy() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/marketplace/${listingId}`)}`);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("create_digital_order", { p_listing_id: listingId });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push(`/dashboard/marketplace/order/${data.id}`);
  }

  if (status !== "aktif") {
    return <div className="card p-4 text-center text-sm text-ink/50">Produk ini sudah tidak tersedia.</div>;
  }

  return (
    <button onClick={handleBuy} disabled={loading} className="btn-primary w-full">
      {loading ? "Memproses..." : "Beli Sekarang"}
    </button>
  );
}
