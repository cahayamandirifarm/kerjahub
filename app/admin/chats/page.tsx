"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatChatTime, initials } from "@/lib/chat-helpers";
import { AlertTriangle, Briefcase, ShoppingBag, Lock, Headset } from "lucide-react";
import clsx from "clsx";

export default function AdminChatsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<"semua" | "sengketa" | "bantuan">("semua");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("conversations")
      .select(
        "id, source_type, is_dispute, is_locked, last_message_at, job:jobs(title), order:digital_orders(listing:digital_listings(title)), conversation_members(profile_id, member_role, profiles(full_name, avatar_url, role))"
      )
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (filter === "sengketa") q = q.eq("is_dispute", true);
    if (filter === "bantuan") q = q.eq("source_type", "bantuan");
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-chats-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Monitoring Chat</h1>
      <p className="text-sm text-ink/50 mb-5">Pantau seluruh percakapan job & marketplace, serta chat bantuan, secara realtime.</p>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setFilter("semua")}
          className={clsx("px-4 py-2 rounded-pill text-sm font-semibold", filter === "semua" ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60")}
        >
          Semua Percakapan
        </button>
        <button
          onClick={() => setFilter("sengketa")}
          className={clsx("px-4 py-2 rounded-pill text-sm font-semibold", filter === "sengketa" ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60")}
        >
          Sedang Sengketa
        </button>
        <button
          onClick={() => setFilter("bantuan")}
          className={clsx("px-4 py-2 rounded-pill text-sm font-semibold flex items-center gap-1.5", filter === "bantuan" ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60")}
        >
          <Headset size={14} /> Bantuan Pengguna
        </button>
      </div>

      <div className="space-y-2">
        {loading && <div className="card p-8 text-center text-ink/40 text-sm">Memuat...</div>}
        {!loading && rows.length === 0 && <div className="card p-8 text-center text-ink/50 text-sm">Tidak ada percakapan.</div>}

        {rows.map((c) => {
          const isBantuan = c.source_type === "bantuan";
          const memberProfiles = (c.conversation_members || []) as any[];
          // Buat chat bantuan, tampilkan nama PENGGUNA yang minta bantuan
          // (bukan admin yang mungkin sudah/belum join) di daftar ini.
          const requester = memberProfiles.find((m) => m.profiles?.role !== "admin") || memberProfiles[0];
          const title = isBantuan ? "Chat Bantuan" : c.job?.title || c.order?.listing?.title || "Percakapan";
          const members = isBantuan
            ? [requester?.profiles?.full_name].filter(Boolean)
            : memberProfiles.map((m) => m.profiles?.full_name).filter(Boolean);
          return (
            <Link key={c.id} href={`/admin/chats/${c.id}`} className="card p-3.5 flex items-center gap-3 hover:border-turquoise/50">
              <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-display font-bold shrink-0">
                {isBantuan ? <Headset size={18} /> : initials(members[0])}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate flex items-center gap-1.5">
                  {title}
                  {isBantuan ? (
                    <Headset size={12} className="text-turquoise" />
                  ) : c.source_type === "marketplace" ? (
                    <ShoppingBag size={12} className="text-ink/30" />
                  ) : (
                    <Briefcase size={12} className="text-ink/30" />
                  )}
                  {c.is_locked && <Lock size={12} className="text-clay" />}
                </p>
                <p className="text-xs text-ink/50 truncate">{members.join(" · ") || "-"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-ink/40">{formatChatTime(c.last_message_at)}</p>
                {c.is_dispute && (
                  <span className="text-[10px] font-bold text-clay flex items-center gap-1 justify-end mt-0.5">
                    <AlertTriangle size={11} /> Sengketa
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
