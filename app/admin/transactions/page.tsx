"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminTxActionButtons from "@/components/AdminTxActionButtons";
import { X, Landmark } from "lucide-react";

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
  fee_amount: number | null;
  net_amount: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "Top Up Saldo",
  penarikan: "Penarikan Saldo",
  bayar_kerja: "Pembayaran Kerja (Escrow)",
  terima_upah: "Upah Diterima Pekerja",
  komisi_platform: "Komisi Platform",
  refund: "Pengembalian Saldo",
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

function WithdrawDetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5 bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Landmark size={18} className="text-turquoise" /> Data Penarikan
          </h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-ink/40 text-xs">Pemohon</p>
            <p className="font-semibold">{row.user_name ?? "-"}</p>
          </div>
          <div className="bg-paper rounded-xl p-3 space-y-1">
            <p className="text-ink/40 text-xs">Rekening Bank / E-Wallet Tujuan</p>
            <p className="font-semibold">{row.bank_name || "-"}</p>
            <p>{row.bank_account_number || "-"}</p>
            <p className="text-ink/60">a.n. {row.bank_account_holder || "-"}</p>
          </div>
          <div className="border-t border-line pt-3 space-y-1">
            <div className="flex justify-between">
              <span className="text-ink/60">Nominal diajukan</span>
              <span className="font-semibold">{formatRupiah(row.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/60">Biaya admin platform</span>
              <span className="font-semibold text-clay">- {formatRupiah(row.fee_amount ?? 0)}</span>
            </div>
            <div className="flex justify-between text-base border-t border-line pt-2 mt-1">
              <span className="font-semibold">Nominal bersih ditransfer</span>
              <span className="font-display font-bold text-turquoise-dark">{formatRupiah(row.net_amount ?? row.amount)}</span>
            </div>
          </div>
          <p className="text-xs text-ink/40 pt-1">
            Transfer manual sejumlah nominal bersih di atas ke rekening/e-wallet tujuan, baru klik Terima pada baris transaksi ini.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminTransactionsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"menunggu" | "semua">("menunggu");
  const [loading, setLoading] = useState(true);
  const [detailRow, setDetailRow] = useState<Row | null>(null);

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
              {r.tx_type === "penarikan" && r.net_amount != null && (
                <p className="text-xs text-turquoise-dark font-semibold">Bersih: {formatRupiah(r.net_amount)}</p>
              )}
              {r.note && <p className="text-xs text-ink/40 mt-1">{r.note}</p>}
              {r.proof_url ? (
                <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-turquoise underline block mt-1">
                  Lihat bukti transfer
                </a>
              ) : (
                r.tx_type !== "penarikan" &&
                r.status === "menunggu" && <p className="text-xs text-clay mt-1">Belum ada bukti transfer diunggah</p>
              )}
              {r.tx_type === "penarikan" && (
                <button
                  onClick={() => setDetailRow(r)}
                  className="text-xs font-semibold text-turquoise underline block mt-1"
                >
                  Lihat data penarikan
                </button>
              )}
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <span className={`badge-stage ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              {r.status === "menunggu" && <AdminTxActionButtons source={r.source} id={r.id} onDone={load} />}
            </div>
          </div>
        ))}
      </div>

      {detailRow && <WithdrawDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  );
}
