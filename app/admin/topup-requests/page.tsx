"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

// 10 permintaan per halaman agar query & payload halaman admin lebih ringan.
const PAGE_SIZE = 10;

interface TopupRow {
  id: string;
  user_id: string;
  amount_input: number;
  unique_code: number;
  amount_final: number;
  payment_method: string;
  status: "pending" | "paid" | "rejected";
  proof_url: string | null;
  created_at: string;
  profiles?: { full_name: string; username: string } | null;
}

export default function AdminTopupRequestsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  async function load() {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE;
    let query = supabase
      .from("topup_requests")
      .select("*, profiles!topup_requests_user_id_fkey(full_name, username)")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (filter === "pending") query = query.eq("status", "pending");
    const { data, error } = await query;
    if (error) {
      console.error("Gagal memuat permintaan top up:", error);
    }
    const all = (data as any) || [];
    setHasNext(all.length > PAGE_SIZE);
    setRows(all.slice(0, PAGE_SIZE));
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("admin-topup-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "topup_requests" }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  async function review(id: string, approve: boolean) {
    setLoadingId(id);
    const { error } = await supabase.rpc("admin_review_topup", { p_request_id: id, p_approve: approve });
    setLoadingId(null);
    if (error) alert(error.message);
    load();
  }

  const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", paid: "Berhasil", rejected: "Ditolak" };
  const STATUS_CLASS: Record<string, string> = {
    pending: "stage-dibayar",
    paid: "stage-terbuka",
    rejected: "bg-clay/10 text-clay"
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Permintaan Top Up Saldo</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("pending")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${filter === "pending" ? "bg-turquoise text-paper" : "bg-white border border-line"}`}
          >
            Menunggu
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full ${filter === "all" ? "bg-turquoise text-paper" : "bg-white border border-line"}`}
          >
            Semua
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada permintaan top up.</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">{r.profiles?.full_name ?? "-"} <span className="text-ink/40 text-xs">@{r.profiles?.username}</span></p>
              <p className="text-xs text-ink/40">{new Date(r.created_at).toLocaleString("id-ID")}</p>
              <div className="mt-1 text-sm text-ink/60">
                Nominal input: {formatRupiah(r.amount_input)} + kode {r.unique_code}
              </div>
              <p className="font-display text-lg font-semibold text-gold-dark">{formatRupiah(r.amount_final)}</p>
              <p className="text-xs text-ink/40">Metode: {r.payment_method}</p>
              {r.proof_url && (
                <a href={r.proof_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                  Lihat bukti
                </a>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge-stage ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => review(r.id, true)}
                    disabled={loadingId === r.id}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                  >
                    Konfirmasi
                  </button>
                  <button
                    onClick={() => review(r.id, false)}
                    disabled={loadingId === r.id}
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    Tolak
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 my-8">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sebelumnya
        </button>
        <span className="text-sm text-ink/50 font-semibold px-1">Halaman {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasNext}
          className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
