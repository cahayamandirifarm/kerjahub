"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function EmployerWalletContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"topup" | "tarik">(
    (searchParams.get("tab") as "topup" | "tarik") || "topup"
  );
  const [profile, setProfile] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  const supabase = createClient();

  async function loadData() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?next=/dashboard/employer/withdraw");
      return;
    }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(p);
    const { data: txs } = await supabase
      .from("transactions")
      .select("*")
      .eq("profile_id", user.id)
      .in("type", ["deposit", "penarikan"])
      .order("created_at", { ascending: false })
      .limit(15);
    setTransactions(txs || []);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!proofFile) {
      setError("Unggah bukti transfer / QRIS terlebih dahulu.");
      return;
    }
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const path = `${user.id}/${Date.now()}-${proofFile.name}`;
    const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, proofFile);
    if (uploadError) {
      setLoading(false);
      setError("Gagal mengunggah bukti pembayaran.");
      return;
    }
    const { data: urlData } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 60 * 24 * 365);

    const { error: insertError } = await supabase.from("transactions").insert({
      profile_id: user.id,
      type: "deposit",
      amount: Number(amount),
      status: "menunggu",
      note: "Top up saldo via transfer manual / QRIS, menunggu verifikasi admin.",
      proof_url: urlData?.signedUrl
    });
    setLoading(false);
    if (insertError) {
      setError("Gagal mengajukan top up.");
      return;
    }
    setMessage("Pengajuan top up terkirim. Menunggu verifikasi admin (biasanya < 1x24 jam).");
    setAmount("");
    setProofFile(null);
    loadData();
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const { error: rpcError } = await supabase.rpc("request_withdrawal", { p_amount: Number(amount) });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMessage("Penarikan diajukan. Biaya admin Rp10.000 akan dipotong saat disetujui admin.");
    setAmount("");
    loadData();
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Dompet</h1>
      <p className="text-sm text-ink/60 mb-4">
        Saldo saat ini: <span className="font-semibold text-ink">{formatRupiah(profile?.wallet_balance ?? 0)}</span>
      </p>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("topup")}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${tab === "topup" ? "bg-turquoise text-paper" : "bg-white border border-line text-ink/60"}`}
        >
          Top Up
        </button>
        <button
          onClick={() => setTab("tarik")}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold ${tab === "tarik" ? "bg-turquoise text-paper" : "bg-white border border-line text-ink/60"}`}
        >
          Tarik Saldo
        </button>
      </div>

      {tab === "topup" ? (
        <form onSubmit={handleTopUp} className="space-y-4 card p-5">
          <p className="text-sm text-ink/60">
            Transfer ke rekening BCA 8800112233 a.n. PT KerjaHub Indonesia atau scan QRIS di bawah, lalu unggah bukti pembayaran.
          </p>
          <div className="bg-turquoise-light rounded-xl p-4 text-center text-sm text-turquoise-dark font-medium">
            [ Kode QRIS KerjaHub akan tampil di sini ]
          </div>
          <div>
            <label className="label">Jumlah Top Up (Rp)</label>
            <input className="input" type="number" min={10000} required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Bukti Transfer / QRIS</label>
            <input
              className="input"
              type="file"
              accept="image/*,application/pdf"
              required
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
            />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          {message && <p className="text-sm text-turquoise">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mengirim..." : "Ajukan Top Up"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleWithdraw} className="space-y-4 card p-5">
          <p className="text-sm text-ink/60">
            Setiap penarikan dikenakan biaya admin <b>Rp10.000</b> per transaksi.
          </p>
          <div>
            <label className="label">Jumlah Penarikan (Rp)</label>
            <input className="input" type="number" min={10000} required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          {message && <p className="text-sm text-turquoise">{message}</p>}
          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? "Mengirim..." : "Ajukan Penarikan"}
          </button>
        </form>
      )}

      <h2 className="font-display text-lg font-semibold mt-8 mb-3">Riwayat</h2>
      <div className="space-y-2">
        {transactions.map((tx) => (
          <div key={tx.id} className="card p-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold capitalize">{tx.type === "deposit" ? "Top Up" : "Penarikan"}</p>
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

export default function EmployerWalletPage() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-ink/40 text-sm">Memuat...</div>}>
      <EmployerWalletContent />
    </Suspense>
  );
}
