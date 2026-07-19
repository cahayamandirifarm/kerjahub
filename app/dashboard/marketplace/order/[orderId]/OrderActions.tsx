"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_WHATSAPP_NUMBER } from "@/lib/types";
import { MessageCircle } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function OrderActions({
  orderId,
  status,
  isBuyer,
  isSeller,
  bankAccount
}: {
  orderId: string;
  status: string;
  isBuyer: boolean;
  isSeller: boolean;
  bankAccount: any;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  async function uploadTo(bucket: string, prefix: string) {
    if (!file) return null;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const path = `${user?.id}/${prefix}-${orderId}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return alert("Unggah bukti transfer dulu.");
    setLoading(true);
    const url = await uploadTo("payment-proofs", "digitalpay");
    if (!url) {
      setLoading(false);
      return alert("Gagal unggah bukti.");
    }
    const { error } = await supabase.rpc("submit_digital_payment", { p_order_id: orderId, p_proof_url: url });
    setLoading(false);
    if (error) return alert(error.message);
    router.refresh();
  }

  async function handleDelivery(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return alert("Unggah bukti penyerahan produk dulu.");
    setLoading(true);
    const url = await uploadTo("digital-order-proofs", "delivery");
    if (!url) {
      setLoading(false);
      return alert("Gagal unggah bukti.");
    }
    const { error } = await supabase.rpc("submit_delivery_proof", { p_order_id: orderId, p_proof_url: url });
    setLoading(false);
    if (error) return alert(error.message);
    router.refresh();
  }

  async function handleReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return alert("Unggah bukti penerimaan produk dulu.");
    setLoading(true);
    const url = await uploadTo("digital-order-proofs", "receipt");
    if (!url) {
      setLoading(false);
      return alert("Gagal unggah bukti.");
    }
    const { error } = await supabase.rpc("submit_receipt_proof", { p_order_id: orderId, p_proof_url: url });
    setLoading(false);
    if (error) return alert(error.message);
    router.refresh();
  }

  async function handleDispute() {
    if (!disputeReason.trim()) return;
    setLoading(true);
    await supabase.rpc("open_digital_dispute", { p_order_id: orderId, p_reason: disputeReason });
    setLoading(false);
    setShowDispute(false);
    router.refresh();
  }

  const waLink = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Halo admin, saya butuh bantuan untuk transaksi marketplace digital dengan ID order ${orderId.slice(0, 8)}.`
  )}`;

  return (
    <div className="space-y-4">
      {status === "menunggu_pembayaran" && isBuyer && bankAccount && (
        <form onSubmit={handlePayment} className="card p-5 space-y-3">
          <p className="text-sm font-semibold text-ink">Metode Pembayaran</p>
          <p className="text-sm text-ink/60">
            Transfer ke <b>{bankAccount.bank_name}</b> {bankAccount.account_number} a.n {bankAccount.account_holder}
          </p>
          {bankAccount.qris_image_url && (
            <div className="bg-paper rounded-xl p-3 text-center">
              <p className="text-xs text-ink/50 mb-2">atau scan QRIS berikut</p>
              <img src={bankAccount.qris_image_url} alt="QRIS pembayaran" className="w-40 h-40 object-contain mx-auto rounded-lg border border-line" />
            </div>
          )}
          <label className="label !mb-0">Unggah Bukti Transfer / QRIS</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mengirim..." : "Kirim Bukti Pembayaran"}
          </button>
        </form>
      )}

      {status === "menunggu_konfirmasi_admin" && (
        <div className="card p-4 text-sm text-ink/60">Menunggu verifikasi admin.</div>
      )}

      {(status === "dana_diamankan" || status === "menunggu_konfirmasi_selesai") && isSeller && (
        <form onSubmit={handleDelivery} className="card p-5 space-y-3">
          <p className="text-sm font-semibold">Unggah Bukti Penyerahan Produk</p>
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mengirim..." : "Kirim Bukti Penyerahan"}
          </button>
        </form>
      )}

      {status === "menunggu_konfirmasi_selesai" && isBuyer && (
        <form onSubmit={handleReceipt} className="card p-5 space-y-3">
          <p className="text-sm font-semibold">Unggah Bukti Penerimaan Produk</p>
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mengirim..." : "Konfirmasi Terima Produk"}
          </button>
        </form>
      )}

      {status === "selesai" && <div className="card p-4 text-sm text-forest font-semibold">Transaksi selesai.</div>}
      {status === "sengketa" && <div className="card p-4 text-sm text-clay font-semibold">Sengketa sedang ditangani admin.</div>}

      {!["selesai", "dibatalkan"].includes(status) && (
        <div className="card p-4">
          {!showDispute ? (
            <button onClick={() => setShowDispute(true)} className="text-sm font-semibold text-clay">
              Ada kendala? Buka Sengketa
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                className="input min-h-[80px]"
                placeholder="Jelaskan kendala transaksi ini..."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <button onClick={handleDispute} disabled={loading} className="btn-gold w-full">
                Kirim Sengketa
              </button>
            </div>
          )}
          <a
            href={waLink}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-forest"
          >
            <MessageCircle size={15} /> Diskusi via WhatsApp Admin
          </a>
        </div>
      )}
    </div>
  );
}
