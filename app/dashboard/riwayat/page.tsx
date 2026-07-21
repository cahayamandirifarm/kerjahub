"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, Receipt } from "lucide-react";

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
  counterpart_name: string | null;
  created_at: string;
  fee_amount: number | null;
  net_amount: number | null;
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "Top Up Saldo",
  penarikan: "Penarikan Saldo",
  bayar_kerja: "Pembayaran Kerja (Escrow)",
  terima_upah: "Upah Diterima",
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

const TABS: { key: "semua" | Row["status"]; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "menunggu", label: "Menunggu" },
  { key: "diterima", label: "Diterima" },
  { key: "ditolak", label: "Ditolak" },
  { key: "dibatalkan", label: "Dibatalkan" }
];

export default function RiwayatTransaksiPage() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"semua" | Row["status"]>("semua");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login?next=/dashboard/riwayat");
      return;
    }

    // Bereskan transaksi yang sudah lewat 6 jam tanpa bukti transfer.
    await supabase.rpc("auto_cancel_expired_transactions");

    const { data, error } = await supabase.rpc("get_my_transactions");
    if (error) {
      console.error("Gagal memuat riwayat transaksi:", error);
    }
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("my-transactions")
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

  const visibleRows = tab === "semua" ? rows : rows.filter((r) => r.status === tab);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/employer" className="text-ink/50 hover:text-ink">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Receipt size={20} className="text-turquoise" /> Riwayat Transaksi
        </h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ${
              tab === t.key ? "bg-turquoise text-paper" : "bg-white border border-line"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {!loading && visibleRows.length === 0 && (
          <div className="card p-6 text-center text-ink/50 text-sm">Belum ada transaksi di kategori ini.</div>
        )}

        {visibleRows.map((r) => (
          <div key={`${r.source}-${r.id}`} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-ink/40">{new Date(r.created_at).toLocaleString("id-ID")}</p>
              <p className="font-semibold text-sm">
                {TYPE_LABEL[r.tx_type] ?? r.tx_type}
                {r.counterpart_name && <span className="text-ink/40 font-normal"> — {r.counterpart_name}</span>}
              </p>
              <p className="font-display text-lg font-semibold text-gold-dark">{formatRupiah(r.amount)}</p>
              {r.tx_type === "penarikan" && r.net_amount != null && (
                <p className="text-xs text-turquoise-dark font-semibold">
                  Nominal bersih diterima: {formatRupiah(r.net_amount)}
                  {r.fee_amount != null && <span className="text-ink/40 font-normal"> (fee {formatRupiah(r.fee_amount)})</span>}
                </p>
              )}
              {r.note && <p className="text-xs text-ink/40 mt-1">{r.note}</p>}
            </div>
            <span className={`badge-stage shrink-0 ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
