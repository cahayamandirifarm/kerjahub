import { createClient } from "@/lib/supabase/server";
import { AdminTxReviewButtons } from "@/components/AdminReviewButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminDepositsPage() {
  const supabase = createClient();
  const { data: deposits, error } = await supabase
    .from("transactions")
    .select("*, profiles!transactions_profile_id_fkey(full_name)")
    .eq("type", "deposit")
    .eq("status", "menunggu")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Gagal memuat top up dompet lama:", error);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Top Up Masuk (Bukti QRIS / Transfer)</h1>
      <div className="space-y-3">
        {(!deposits || deposits.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada pengajuan top up yang menunggu.</div>
        )}
        {deposits?.map((tx: any) => (
          <div key={tx.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">{tx.profiles?.full_name}</p>
              <p className="text-lg font-display font-semibold text-gold-dark">{formatRupiah(tx.amount)}</p>
              {tx.proof_url && (
                <a href={tx.proof_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                  Lihat bukti pembayaran
                </a>
              )}
            </div>
            <AdminTxReviewButtons txId={tx.id} rpcName="admin_review_deposit" />
          </div>
        ))}
      </div>
    </div>
  );
}
