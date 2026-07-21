"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Copy, Check, QrCode } from "lucide-react";

interface PaymentSettings {
  bank_name: string;
  account_number: string;
  account_holder: string;
  qris_image_url: string | null;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function TopUpModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [step, setStep] = useState<"input" | "payment" | "done">("input");
  const [amount, setAmount] = useState("");
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [request, setRequest] = useState<{ id: string; unique_code: number; amount_final: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"amount" | "account" | null>(null);

  useEffect(() => {
    supabase
      .from("payment_settings")
      .select("bank_name, account_number, account_holder, qris_image_url")
      .eq("id", 1)
      .single()
      .then(({ data }) => setSettings(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 10000) {
      setError("Minimal top up Rp10.000");
      return;
    }
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("create_topup_request", {
      p_amount_input: numAmount,
      p_payment_method: settings?.bank_name && settings?.account_number ? "transfer" : "qris"
    });
    setLoading(false);
    if (rpcError || !data) {
      setError(rpcError?.message || "Gagal membuat permintaan top up.");
      return;
    }
    setRequest({ id: data.id, unique_code: data.unique_code, amount_final: Number(data.amount_final) });
    setStep("payment");
  }

  async function handleAlreadyTransferred() {
    if (!request) return;
    setLoading(true);
    await supabase.rpc("mark_topup_transferred", { p_request_id: request.id });
    setLoading(false);
    setStep("done");
  }

  function copyText(text: string, key: "amount" | "account") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-[200] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-card rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-display text-lg font-semibold">Top Up Saldo</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink/70">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {step === "input" && (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="label">Nominal Top Up (Rp)</label>
                <input
                  className="input"
                  type="number"
                  min={10000}
                  step={1000}
                  required
                  autoFocus
                  placeholder="100000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-clay">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Memproses..." : "Lanjutkan"}
              </button>
            </form>
          )}

          {step === "payment" && request && settings && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-ink/50">Nominal: {formatRupiah(Number(amount))}</p>
                <p className="text-sm text-ink/50">Kode unik: {request.unique_code}</p>
                <p className="text-xs text-ink/40 mt-1">Total Transfer</p>
                <p className="font-display text-4xl font-semibold text-gold-dark mt-1">
                  {formatRupiah(request.amount_final)}
                </p>
                <button
                  onClick={() => copyText(String(request.amount_final), "amount")}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-turquoise mt-2"
                >
                  {copied === "amount" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "amount" ? "Tersalin!" : "Salin Nominal"}
                </button>
                <p className="text-xs text-clay mt-2 font-medium">
                  Transfer angka persis di atas (termasuk kode unik) agar admin mudah memverifikasi.
                </p>
              </div>

              {settings.bank_name && settings.account_number && (
                <div className="card p-4">
                  <p className="text-xs text-ink/50 mb-1">Transfer ke:</p>
                  <p className="font-display text-lg font-semibold uppercase">{settings.bank_name}</p>
                  <p className="text-ink/80">{settings.account_number}</p>
                  <p className="text-sm text-ink/50">a.n {settings.account_holder}</p>
                  <button
                    onClick={() => copyText(settings.account_number as string, "account")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-turquoise mt-2"
                  >
                    {copied === "account" ? <Check size={14} /> : <Copy size={14} />}
                    {copied === "account" ? "Tersalin!" : "Salin Nomor Rekening"}
                  </button>
                </div>
              )}

              {settings.qris_image_url ? (
                <div className="card p-4 text-center">
                  <img src={settings.qris_image_url} alt="QRIS" className="w-48 h-48 object-contain mx-auto" />
                  <p className="text-xs text-ink/40 mt-2">
                    {settings.bank_name && settings.account_number ? "Atau scan QRIS di atas" : "Scan QRIS di atas untuk membayar"}
                  </p>
                </div>
              ) : settings.bank_name && settings.account_number ? null : (
                <div className="card p-4 text-center text-xs text-ink/40 flex flex-col items-center gap-1">
                  <QrCode size={24} />
                  Metode pembayaran belum diatur admin. Hubungi admin untuk melanjutkan.
                </div>
              )}

              <button onClick={handleAlreadyTransferred} disabled={loading} className="btn-primary w-full">
                {loading ? "Memproses..." : "Saya Sudah Transfer"}
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-6">
              <Check className="mx-auto text-turquoise mb-3" size={40} />
              <p className="font-semibold text-ink">
                Permintaan top up berhasil dikirim dan menunggu verifikasi admin.
              </p>
              <button onClick={onClose} className="btn-secondary w-full mt-6">
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
