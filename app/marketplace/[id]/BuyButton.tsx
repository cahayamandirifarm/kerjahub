"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SelfActionBlockedModal from "@/components/SelfActionBlockedModal";

export default function BuyButton({
  listingId,
  status,
  stock,
  ownerId
}: {
  listingId: string;
  status: string;
  stock: number;
  ownerId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  async function handleBuy() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/marketplace/${listingId}`)}`);
      return;
    }

    // GATE: tidak boleh membeli produk sendiri
    if (user.id === ownerId) {
      setShowBlocked(true);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("create_digital_order", { p_listing_id: listingId });
    setLoading(false);
    if (error) {
      // Jaring pengaman kalau lolos pengecekan di atas tapi tertahan oleh
      // fungsi create_digital_order di database.
      if (error.message?.toLowerCase().includes("sendiri")) {
        setShowBlocked(true);
        return;
      }
      alert(error.message);
      return;
    }
    router.push(`/dashboard/marketplace/order/${data.id}`);
  }

  if (status !== "aktif" || stock <= 0) {
    return <div className="card p-4 text-center text-sm text-ink/50">Stok produk ini sudah habis.</div>;
  }

  return (
    <div>
      <button onClick={handleBuy} disabled={loading} className="btn-primary w-full">
        {loading ? "Memproses..." : "Beli Sekarang"}
      </button>

      <SelfActionBlockedModal
        open={showBlocked}
        message="Tidak dapat melakukan aksi ini karena produk ini adalah milik Anda sendiri."
        onClose={() => setShowBlocked(false)}
      />
    </div>
  );
}
