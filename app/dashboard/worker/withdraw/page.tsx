"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export default function WorkerWithdrawPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  async function loadData() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/dashboard/worker/withdraw");
      return;
    }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(p);
    const { data: txs } = await supabase
      .from("transactions")
      .select("*")
      .eq("profile_id", user.id)
      .eq("type", "penarikan")
      .order("created_at", { ascending: false })
      .limit(15);
    setTransactions(txs || []);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numAmount = Number(amount) || 0;
  const biayaAdmin = 10000;
  const biayaTarik = Math.round(numAmount * 0.05);
  const diterima = numAmount > 0 ? numAmount - biayaAdmin - biayaTarik : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!profile?.bank_account_number) {
      setError("Lengkapi data rekening bank terlebih dahulu.");
      return;
    }
    setLoading(true);
    const { error: rpcError } = await supabase.rpc("request_withdrawal", { p_amount: numAmount });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMessage("Penarikan diajukan, menunggu persetujuan admin.");
    setAmount("");
    loadData();
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Tarik Saldo</h1>
      <p className="text-sm text-ink/60 mb-4">
        Saldo tersedia: <span className="font-semibold text-ink">{formatRupiah(profile?.wallet_balance ?? 0)}</span>
      </p>

      {!profile?.bank_account_number && (
        <div className="card p-4 bg-gold-light mb-4 text-sm flex items-center justify-between gap-3">
          Rekening bank/e-wallet belum diisi.
          <Link href="/dashboard/worker/bank" className="btn-secondary !px-3 !py-1.5 text-xs shrink-0">
            Isi sekarang
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 card p-5">
        <div>
          <label className="label">Jumlah Penarikan (Rp)</label>
          <input className="input" type="number" min={20000} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {numAmount > 0 && (
          <div className="bg-paper rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between text-ink/60">
              <span>Biaya admin</span>
              <span>{formatRupiah(biayaAdmin)}</span>
            </div>
            <div className="flex justify-between text-ink/60">
              <span>Biaya penarikan (5%)</span>
              <span>{formatRupiah(biayaTarik)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ink border-t border-line pt-1 mt-1">
              <span>Estimasi diterima</span>
              <span>{formatRupiah(Math.max(diterima, 0))}</span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-clay">{error}</p>}
        {message && <p className="text-sm text-turquoise">{message}</p>}
        <button type="submit" disabled={loading} className="btn-gold w-full">
          {loading ? "Mengirim..." : "Ajukan Penarikan"}
        </button>
      </form>

      <h2 className="font-display text-lg font-semibold mt-8 mb-3">Riwayat Penarikan</h2>
      <div className="space-y-2">
        {transactions.map((tx) => (
          <div key={tx.id} className="card p-3 flex items-center justify-between text-sm">
            <div>
              <p className="text-ink/40 text-xs">{new Date(tx.created_at).toLocaleString("id-ID")}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatRupiah(tx.amount)}</p>
              <p className={`text-xs ${tx.status === "berhasil" ? "text-turquoise" : tx.status === "ditolak" ? "text-clay" : "text-gold-dark"}`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
