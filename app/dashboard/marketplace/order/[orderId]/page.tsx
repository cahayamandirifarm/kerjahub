import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { MessageCircle } from "lucide-react";
import { DIGITAL_ORDER_LABEL, DigitalOrderStatus } from "@/lib/types";
import OrderActions from "./OrderActions";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export default async function DigitalOrderPage({ params }: { params: { orderId: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/marketplace/order/${params.orderId}`);

  const { data: order } = await supabase
    .from("digital_orders")
    .select("*, digital_listings(title, cover_image), buyer:profiles!digital_orders_buyer_id_fkey(full_name, phone), seller:profiles!digital_orders_seller_id_fkey(full_name, phone)")
    .eq("id", params.orderId)
    .single();

  if (!order) notFound();
  const isBuyer = order.buyer_id === user.id;
  const isSeller = order.seller_id === user.id;
  if (!isBuyer && !isSeller) redirect("/dashboard/marketplace/orders");

  const { data: settings } = await supabase.from("payment_settings").select("*").eq("id", 1).single();
  const { data: conversation } = await supabase.from("conversations").select("id").eq("order_id", order.id).single();

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <img src={order.digital_listings?.cover_image} alt="" className="w-14 h-14 rounded-lg object-cover" />
          <div>
            <h1 className="font-display text-lg font-semibold">{order.digital_listings?.title}</h1>
            <span className="badge-stage stage-dibayar text-[10px]">
              {DIGITAL_ORDER_LABEL[order.status as DigitalOrderStatus]}
            </span>
          </div>
        </div>

        <div className="card p-4 mb-4 text-sm">
          <p className="flex justify-between">
            <span className="text-ink/50">Harga produk</span> <span>{formatRupiah(order.base_amount)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-ink/50">Kode unik</span> <span>{order.unique_code}</span>
          </p>
          <p className="flex justify-between font-semibold border-t border-line pt-2 mt-2">
            <span>Total</span> <span className="text-gold-dark">{formatRupiah(order.amount_final)}</span>
          </p>
        </div>

        {order.delivery_proof_url && (
          <div className="card p-4 mb-4">
            <p className="text-xs font-semibold text-ink/50 mb-2">Bukti Penyerahan dari Penjual</p>
            <a href={order.delivery_proof_url} target="_blank">
              <img src={order.delivery_proof_url} alt="" className="w-full rounded-lg" />
            </a>
          </div>
        )}
        {order.receipt_proof_url && (
          <div className="card p-4 mb-4">
            <p className="text-xs font-semibold text-ink/50 mb-2">Bukti Penerimaan dari Pembeli</p>
            <a href={order.receipt_proof_url} target="_blank">
              <img src={order.receipt_proof_url} alt="" className="w-full rounded-lg" />
            </a>
          </div>
        )}

        {conversation && (
          <Link href={`/chat/${conversation.id}`} className="btn-secondary w-full !py-3 mb-4 gap-2">
            <MessageCircle size={16} /> {isBuyer ? "Chat dengan Penjual" : "Chat dengan Pembeli"}
          </Link>
        )}

        <OrderActions
          orderId={order.id}
          status={order.status}
          isBuyer={isBuyer}
          isSeller={isSeller}
          bankAccount={settings}
        />
      </div>
    </div>
  );
}
