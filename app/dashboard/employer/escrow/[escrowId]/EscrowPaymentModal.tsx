"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X, Copy, Check, QrCode, Upload, MessageCircle, Wallet } from "lucide-react";
import { ADMIN_WHATSAPP_NUMBER } from "@/lib/types";

interface Escrow {
  id: string;
  status: "menunggu_pembayaran" | "menunggu_konfirmasi_admin" | "berhasil" | "ditolak";
  base_amount: number;
  unique_code: number;
  total_amount: number;
  wallet_deducted: number;
  proof_url: string | null;
}
interface Bank {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

const STATUS_LABEL: Record<string, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_konfirmasi_admin: "Menunggu Konfirmasi Admin",
  berhasil: "Pembayaran Berhasil",
  ditolak: "Bukti Ditolak — unggah ulang"
};

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function EscrowPaymentModal({
  escrow,
  jobTitle,
  isPayer,
  bank,
  qrisImageUrl
}: {
  escrow: Escrow;
  jobTitle: string;
  isPayer: boolean;
  bank: Bank | null;
  qrisImageUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"amount" | "account" | null>(null);

  function close() {
    router.back();
  }

  function copyText(text: string, key: "amount" | "account") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Pilih bukti transfer terlebih dahulu.");
      return;
    }
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError("Sesi login tidak ditemukan, silakan login ulang.");
      return;
    }

    const path = `${user.id}/${escrow.id}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file);
    if (uploadError) {
      setLoading(false);
      setError("Gagal mengunggah bukti: " + uploadError.message);
      return;
    }
    const { data: urlData } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 60 * 24 * 365);

    const { error: rpcError } = await supabase.rpc("submit_escrow_proof", {
      p_escrow_id: escrow.id,
      p_proof_url: urlData?.signedUrl
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  const waLink = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Halo admin, saya sudah transfer pembayaran escrow sebesar ${formatRupiah(
      escrow.total_amount
    )} (kode unik ${escrow.unique_code}) untuk pekerjaan "${jobTitle}", ID escrow ${escrow.id.slice(
      0,
      8
    )}. Mohon dicek dan dikonfirmasi ya. Terima kasih.`
  )}`;

  const needsTransfer = escrow.total_amount > 0;

  return (
    <div className="fixed inset-0 z-[200] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">Pembayaran Escrow</h2>
            <p className="text-xs text-ink/50 truncate">{jobTitle}</p>
          </div>
          <button onClick={close} className="text-ink/40 hover:text-ink/70 shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {/* -------- Bukan payer: cuma info status -------- */}
          {!isPayer && (
            <div className="text-center py-4">
              <p className="text-sm font-semibold mb-2">
                Status: <span className="text-turquoise">{STATUS_LABEL[escrow.status] ?? escrow.status}</span>
              </p>
              <p className="text-sm text-ink/60">
                {escrow.status === "menunggu_pembayaran" || escrow.status === "ditolak"
                  ? "Menunggu pihak lain menyelesaikan pembayaran escrow. Kamu akan dinotifikasi begitu dana diamankan."
                  : escrow.status === "menunggu_konfirmasi_admin"
                  ? "Bukti pembayaran sudah dikirim, menunggu verifikasi admin."
                  : "Dana sudah diamankan platform."}
              </p>
              <button onClick={close} className="btn-secondary w-full mt-6">
                Tutup
              </button>
            </div>
          )}

          {/* -------- Payer: butuh bayar / sudah kirim bukti / berhasil -------- */}
          {isPayer && (escrow.status === "menunggu_pembayaran" || escrow.status === "ditolak") && (
            <div className="space-y-4">
              {escrow.status === "ditolak" && (
                <p className="text-sm text-clay font-medium text-center">
                  Bukti sebelumnya ditolak admin — silakan unggah ulang bukti transfer yang benar.
                </p>
              )}

              {escrow.wallet_deducted > 0 && (
                <div className="card p-4 bg-turquoise/10 border border-turquoise/30 flex items-start gap-2.5">
                  <Wallet size={16} className="text-turquoise-dark shrink-0 mt-0.5" />
                  <p className="text-sm text-ink/70">
                    <span className="font-semibold text-turquoise-dark">{formatRupiah(escrow.wallet_deducted)}</span>{" "}
                    sudah otomatis terpotong dari saldo kamu untuk pekerjaan ini.
                    {needsTransfer && " Sisanya perlu ditransfer manual seperti di bawah."}
                  </p>
                </div>
              )}

              {needsTransfer ? (
                <>
                  <div className="text-center">
                    <p className="text-sm text-ink/50">Sisa tagihan: {formatRupiah(escrow.base_amount)}</p>
                    <p className="text-sm text-ink/50">Kode unik: {escrow.unique_code}</p>
                    <p className="text-xs text-ink/40 mt-1">Total Transfer</p>
                    <p className="font-display text-4xl font-semibold text-gold-dark mt-1">
                      {formatRupiah(escrow.total_amount)}
                    </p>
                    <button
                      onClick={() => copyText(String(escrow.total_amount), "amount")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-turquoise mt-2"
                    >
                      {copied === "amount" ? <Check size={14} /> : <Copy size={14} />}
                      {copied === "amount" ? "Tersalin!" : "Salin Nominal"}
                    </button>
                    <p className="text-xs text-clay mt-2 font-medium">
                      Transfer angka persis di atas (termasuk kode unik) agar admin mudah memverifikasi.
                    </p>
                  </div>

                  {bank && (
                    <div className="card p-4">
                      <p className="text-xs text-ink/50 mb-1">Transfer ke:</p>
                      <p className="font-display text-lg font-semibold uppercase">{bank.bank_name}</p>
                      <p className="text-ink/80">{bank.account_number}</p>
                      <p className="text-sm text-ink/50">a.n {bank.account_holder}</p>
                      <button
                        onClick={() => copyText(bank.account_number, "account")}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-turquoise mt-2"
                      >
                        {copied === "account" ? <Check size={14} /> : <Copy size={14} />}
                        {copied === "account" ? "Tersalin!" : "Salin Nomor Rekening"}
                      </button>
                    </div>
                  )}

                  {qrisImageUrl ? (
                    <div className="card p-4 text-center">
                      <img src={qrisImageUrl} alt="QRIS" className="w-48 h-48 object-contain mx-auto" />
                      <p className="text-xs text-ink/40 mt-2">{bank ? "Atau scan QRIS di atas" : "Scan QRIS di atas untuk membayar"}</p>
                    </div>
                  ) : !bank ? (
                    <div className="card p-4 text-center text-xs text-ink/40 flex flex-col items-center gap-1">
                      <QrCode size={24} />
                      Metode pembayaran belum diatur admin
                    </div>
                  ) : null}

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="label">Unggah Bukti Transfer / Pembayaran</label>
                      <input
                        className="input"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      <p className="text-xs text-ink/40 mt-1">Wajib diisi — foto/screenshot bukti transfer atau bukti scan QRIS.</p>
                    </div>
                    {error && <p className="text-sm text-clay">{error}</p>}
                    <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                      <Upload size={16} />
                      {loading ? "Mengirim..." : "Kirim Bukti Pembayaran"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <Check className="mx-auto text-turquoise mb-3" size={40} />
                  <p className="font-semibold text-ink">Seluruh tagihan sudah tertutup dari saldo kamu, tidak ada transfer tambahan yang diperlukan.</p>
                  <button onClick={close} className="btn-secondary w-full mt-6">
                    Tutup
                  </button>
                </div>
              )}
            </div>
          )}

          {isPayer && escrow.status === "menunggu_konfirmasi_admin" && (
            <div className="text-center py-6">
              <Check className="mx-auto text-turquoise mb-3" size={40} />
              <p className="font-semibold text-ink">Bukti pembayaran sudah dikirim, menunggu verifikasi admin (biasanya &lt; 1x24 jam).</p>
              {escrow.proof_url && (
                <a href={escrow.proof_url} target="_blank" rel="noreferrer" className="text-sm text-turquoise underline block mt-3">
                  Lihat bukti yang sudah diunggah
                </a>
              )}
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full mt-6 flex items-center justify-center gap-2 !bg-[#25D366] hover:!bg-[#1ebe57]"
              >
                <MessageCircle size={16} />
                Konfirmasi via WhatsApp Admin
              </a>
              <button onClick={close} className="btn-secondary w-full mt-3">
                Tutup
              </button>
            </div>
          )}

          {isPayer && escrow.status === "berhasil" && (
            <div className="text-center py-6">
              <Check className="mx-auto text-turquoise mb-3" size={40} />
              <p className="font-semibold text-ink">Dana sudah diamankan platform. Pekerja bisa mulai bekerja sekarang.</p>
              <button onClick={close} className="btn-primary w-full mt-6">
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
