import { createClient } from "@/lib/supabase/server";
import { AdminTxReviewButtons } from "@/components/AdminReviewButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminWithdrawalsPage() {
  const supabase = createClient();
  const { data: withdrawals } = await supabase
    .from("transactions")
    .select("*, profiles(full_name, role)")
    .eq("type", "penarikan")
    .eq("status", "menunggu")
    .order("created_at", { ascending: true });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Penarikan Saldo</h1>
      <div className="space-y-3">
        {(!withdrawals || withdrawals.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada pengajuan penarikan yang menunggu.</div>
        )}
        {withdrawals?.map((tx: any) => (
          <div key={tx.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">
                {tx.profiles?.full_name} <span className="text-xs text-ink/40 capitalize">({tx.profiles?.role})</span>
              </p>
              <p className="text-lg font-display font-semibold text-gold-dark">{formatRupiah(tx.amount)}</p>
              <p className="text-sm text-ink/50">
                {tx.bank_name} — {tx.bank_account_number}
              </p>
              <p className="text-xs text-ink/40 mt-1">{tx.note}</p>
            </div>
            <AdminTxReviewButtons txId={tx.id} rpcName="admin_review_withdrawal" />
          </div>
        ))}
      </div>
    </div>
  );
}
