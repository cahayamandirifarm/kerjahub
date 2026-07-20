"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DISPUTE_STATUS_LABEL, DisputeStatus } from "@/lib/types";
import { MessageSquare, Clock } from "lucide-react";
import clsx from "clsx";

const TABS: { key: DisputeStatus; label: string }[] = [
  { key: "menunggu_admin", label: "Menunggu Admin" },
  { key: "diproses", label: "Diproses" },
  { key: "selesai", label: "Selesai" },
  { key: "ditolak", label: "Ditolak" }
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminDisputesPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<DisputeStatus>("menunggu_admin");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("disputes")
      .select(
        "*, conversation:conversations(id, source_type, job:jobs(title), order:digital_orders(listing:digital_listings(title))), opener:profiles!disputes_opened_by_fkey(full_name), admin:profiles!disputes_assigned_admin_id_fkey(full_name)"
      )
      .eq("status", tab)
      .order("created_at", { ascending: tab === "menunggu_admin" });
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-disputes")
      .on("postgres_changes", { event: "*", schema: "public", table: "disputes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function resolve(id: string, status: "selesai" | "ditolak") {
    const note = prompt(status === "selesai" ? "Catatan penyelesaian (opsional):" : "Alasan penolakan (opsional):") || null;
    setBusyId(id);
    const { error } = await supabase.rpc("resolve_dispute", { p_dispute_id: id, p_status: status, p_note: note });
    setBusyId(null);
    if (error) alert(error.message);
    load();
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Dashboard Sengketa Chat</h1>
      <p className="text-sm text-ink/50 mb-6">Tiket sengketa yang dibuat lewat perintah /tanyaadmin di dalam chat.</p>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-4 py-2 rounded-pill text-sm font-semibold transition-colors",
              tab === t.key ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60"
            )}
          >
            {DISPUTE_STATUS_LABEL[t.key]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && <div className="card p-8 text-center text-ink/40 text-sm">Memuat...</div>}
        {!loading && rows.length === 0 && (
          <div className="card p-8 text-center text-ink/50 text-sm">Tidak ada tiket dengan status ini.</div>
        )}

        {rows.map((d) => {
          const title = d.conversation?.job?.title || d.conversation?.order?.listing?.title || "Percakapan";
          return (
            <div key={d.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={clsx("badge-stage text-[10px]", d.status === "menunggu_admin" ? "bg-clay/10 text-clay" : "stage-dibayar")}>
                    {DISPUTE_STATUS_LABEL[d.status as DisputeStatus]}
                  </span>
                  <span className="text-[11px] text-ink/40 flex items-center gap-1">
                    <Clock size={11} /> {formatDateTime(d.created_at)}
                  </span>
                </div>
                <p className="font-semibold truncate">{title}</p>
                <p className="text-xs text-ink/50">
                  Dibuka oleh: {d.opener?.full_name || "-"}
                  {d.admin?.full_name && <> · Ditangani: {d.admin.full_name}</>}
                </p>
                {d.resolution_note && <p className="text-xs text-ink/60 mt-1 italic">"{d.resolution_note}"</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/admin/chats/${d.conversation_id}`} className="btn-secondary !px-3 !py-1.5 text-xs gap-1.5">
                  <MessageSquare size={13} /> Buka Chat
                </Link>
                {(d.status === "menunggu_admin" || d.status === "diproses") && (
                  <>
                    <button
                      onClick={() => resolve(d.id, "selesai")}
                      disabled={busyId === d.id}
                      className="btn-primary !px-3 !py-1.5 text-xs"
                    >
                      Selesai
                    </button>
                    <button
                      onClick={() => resolve(d.id, "ditolak")}
                      disabled={busyId === d.id}
                      className="!px-3 !py-1.5 text-xs rounded-pill border border-clay text-clay font-semibold"
                    >
                      Tolak
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
