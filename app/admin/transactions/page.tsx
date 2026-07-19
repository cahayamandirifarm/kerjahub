import { createClient } from "@/lib/supabase/server";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "Top Up",
  penarikan: "Penarikan",
  bayar_kerja: "Pembayaran Kerja (Escrow)",
  terima_upah: "Upah Diterima Pekerja",
  komisi_platform: "Komisi Platform",
  biaya_admin_tarik: "Biaya Admin Penarikan",
  refund: "Refund"
};

export default async function AdminTransactionsPage() {
  const supabase = createClient();
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(150);

  const { data: komisiRows } = await supabase
    .from("transactions")
    .select("amount")
    .eq("type", "komisi_platform")
    .eq("status", "berhasil");
  const totalKomisi = (komisiRows || []).reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Transaksi & Komisi</h1>
        <div className="card px-4 py-2 text-sm">
          Total komisi platform: <span className="font-semibold text-forest">{formatRupiah(totalKomisi)}</span>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Waktu</th>
              <th className="text-left px-4 py-3">Pengguna</th>
              <th className="text-left px-4 py-3">Jenis</th>
              <th className="text-left px-4 py-3">Jumlah</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions?.map((tx: any) => (
              <tr key={tx.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink/50 whitespace-nowrap">
                  {new Date(tx.created_at).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3">{tx.profiles?.full_name}</td>
                <td className="px-4 py-3">{TYPE_LABEL[tx.type] ?? tx.type}</td>
                <td className="px-4 py-3">{formatRupiah(tx.amount)}</td>
                <td className="px-4 py-3 capitalize">{tx.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
