"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function AdminMarketplaceOrdersPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("digital_orders")
      .select("*, digital_listings(title), buyer:profiles!digital_orders_buyer_id_fkey(full_name), seller:profiles!digital_orders_seller_id_fkey(full_name)")
      .in("status", ["menunggu_konfirmasi_admin", "sengketa"])
      .order("created_at", { ascending: true });
    setRows(data || []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-digital-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "digital_orders" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(id: string, approve: boolean) {
    setLoadingId(id);
    const { error } = await supabase.rpc("admin_confirm_digital_payment", { p_order_id: id, p_approve: approve });
    setLoadingId(null);
    if (error) alert(error.message);
    load();
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Order Marketplace Digital</h1>
      <div className="space-y-3">
        {rows.length === 0 && <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada order yang perlu ditindaklanjuti.</div>}
        {rows.map((o: any) => (
          <div key={o.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">{o.digital_listings?.title}</p>
              <p className="text-xs text-ink/50">
                Pembeli: {o.buyer?.full_name} — Penjual: {o.seller?.full_name}
              </p>
              <p className="font-display text-lg font-semibold text-gold-dark">{formatRupiah(o.amount_final)}</p>
              <span className={`badge-stage ${o.status === "sengketa" ? "bg-clay/10 text-clay" : "stage-dibayar"} text-[10px]`}>
                {o.status === "sengketa" ? "Sengketa" : "Menunggu Konfirmasi"}
              </span>
              {o.proof_url && (
                <a href={o.proof_url} target="_blank" className="block text-xs font-semibold text-turquoise underline mt-1">
                  Lihat bukti pembayaran
                </a>
              )}
            </div>
            {o.status === "menunggu_konfirmasi_admin" && (
              <div className="flex gap-2">
                <button onClick={() => review(o.id, true)} disabled={loadingId === o.id} className="btn-primary !px-3 !py-1.5 text-xs">
                  Konfirmasi
                </button>
                <button onClick={() => review(o.id, false)} disabled={loadingId === o.id} className="btn-secondary !px-3 !py-1.5 text-xs">
                  Tolak
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
