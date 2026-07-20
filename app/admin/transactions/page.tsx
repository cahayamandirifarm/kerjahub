"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminTxActionButtons from "@/components/AdminTxActionButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

interface Row {
  source: string;
  id: string;
  tx_type: string;
  status: "menunggu" | "diterima" | "ditolak" | "dibatalkan";
  raw_status: string;
  amount: number;
  proof_url: string | null;
  note: string | null;
  user_name: string | null;
  counterpart_name: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "Top Up Saldo",
  penarikan: "Penarikan Saldo",
  bayar_kerja: "Pembayaran Kerja (Escrow)",
  marketplace_digital: "Order Marketplace Digital"
};

const STATUS_LABEL: Record<string, string> = {
  menunggu: "Menunggu",
  diterima: "Diterima",
  ditolak: "Ditolak",
  dibatalkan: "Dibatalkan"
};

const STATUS_CLASS: Record<string, string> = {
  menunggu: "stage-dibayar",
  diterima: "stage-terbuka",
  ditolak: "bg-clay/10 text-clay",
  dibatalkan: "bg-ink/10 text-ink/50"
};

const FILTERS: { key: "menunggu" | "semua"; label: string }[] = [
  { key: "menunggu", label: "Menunggu" },
  { key: "semua", label: "Semua" }
];

export default function AdminTransactionsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"menunggu" | "semua">("menunggu");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Sekalian jalankan pembatalan otomatis transaksi yang sudah
    // lewat 6 jam tanpa bukti transfer, tiap kali halaman ini dibuka.
    await supabase.rpc("auto_cancel_expired_transactions");

    const { data, error } = await supabase.rpc("get_all_transactions_admin");
    if (error) {
      console.error("Gagal memuat transaksi:", error);
    }
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("admin-all-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "digital_orders" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRows = filter === "menunggu" ? rows.filter((r) => r.status === "menunggu") : rows;
  const totalMenunggu = rows.filter((r) => r.status === "menunggu").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold">Monitoring Transaksi</h1>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                filter === f.key ? "bg-turquoise text-paper" : "bg-white border border-line"
              }`}
            >
              {f.label} {f.key === "menunggu" && totalMenunggu > 0 ? `(${totalMenunggu})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {!loading && visibleRows.length === 0 && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada transaksi untuk ditampilkan.</div>
        )}

        {visibleRows.map((r) => (
          <div key={`${r.source}-${r.id}`} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="text-xs text-ink/40">{new Date(r.created_at).toLocaleString("id-ID")}</p>
              <p className="font-semibold">
                {r.user_name ?? "-"}
                {r.counterpart_name && <span className="text-ink/40 text-xs"> &harr; {r.counterpart_name}</span>}
              </p>
              <p className="text-sm text-ink/60">{TYPE_LABEL[r.tx_type] ?? r.tx_type}</p>
              <p className="font-display text-lg font-semibold text-gold-dark">{formatRupiah(r.amount)}</p>
              {r.note && <p className="text-xs text-ink/40 mt-1">{r.note}</p>}
              {r.proof_url ? (
                <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-turquoise underline">
                  Lihat bukti transfer
                </a>
              ) : (
                r.status === "menunggu" && <p className="text-xs text-clay">Belum ada bukti transfer diunggah</p>
              )}
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <span className={`badge-stage ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              {r.status === "menunggu" && <AdminTxActionButtons source={r.source} id={r.id} onDone={load} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
