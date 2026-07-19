import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { DIGITAL_ORDER_LABEL, DigitalOrderStatus } from "@/lib/types";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export default async function MarketplaceOrdersPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/marketplace/orders");

  const { data: orders } = await supabase
    .from("digital_orders")
    .select("*, digital_listings(title, cover_image)")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-semibold mb-6">Transaksi Marketplace Digital</h1>
        <div className="space-y-3">
          {(!orders || orders.length === 0) && (
            <div className="card p-6 text-center text-ink/50 text-sm">Belum ada transaksi.</div>
          )}
          {orders?.map((o: any) => (
            <Link key={o.id} href={`/dashboard/marketplace/order/${o.id}`} className="card p-4 flex items-center gap-3 block">
              <img src={o.digital_listings?.cover_image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{o.digital_listings?.title}</p>
                <p className="text-xs text-ink/50">
                  {o.buyer_id === user.id ? "Sebagai Pembeli" : "Sebagai Penjual"} — {formatRupiah(o.amount_final)}
                </p>
              </div>
              <span className="badge-stage stage-dibayar shrink-0 text-[10px]">
                {DIGITAL_ORDER_LABEL[o.status as DigitalOrderStatus]}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
