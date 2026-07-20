"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { formatChatTime, initials } from "@/lib/chat-helpers";
import type { ConversationListItem } from "@/lib/types";
import { Search, MessageCircle, Archive, AlertTriangle, Briefcase, ShoppingBag } from "lucide-react";
import clsx from "clsx";

export default function ChatListPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"aktif" | "arsip">("aktif");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (archived: boolean, search: string) => {
      const { data, error } = await supabase.rpc("list_my_conversations", {
        p_archived: archived,
        p_search: search || null
      });
      if (!error) setItems((data as ConversationListItem[]) || []);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=/chat");
        return;
      }
      setUserId(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const t = setTimeout(() => load(tab === "arsip", query.trim()), 250);
    return () => clearTimeout(t);
  }, [userId, tab, query, load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`chat-list-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () =>
        load(tab === "arsip", query.trim())
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members" }, () =>
        load(tab === "arsip", query.trim())
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-semibold mb-4">Chat</h1>

        <div className="relative mb-3">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            className="input !pl-11"
            placeholder="Cari nama atau pekerjaan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("aktif")}
            className={clsx(
              "px-4 py-2 rounded-pill text-sm font-semibold transition-colors",
              tab === "aktif" ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60"
            )}
          >
            Aktif
          </button>
          <button
            onClick={() => setTab("arsip")}
            className={clsx(
              "px-4 py-2 rounded-pill text-sm font-semibold transition-colors flex items-center gap-1.5",
              tab === "arsip" ? "bg-turquoise text-white" : "bg-white border border-line text-ink/60"
            )}
          >
            <Archive size={14} /> Arsip
          </button>
        </div>

        <div className="space-y-2">
          {loading && <div className="card p-8 text-center text-ink/40 text-sm">Memuat...</div>}

          {!loading && items.length === 0 && (
            <div className="card p-8 text-center text-ink/50 text-sm">
              <MessageCircle className="mx-auto mb-2" />
              {tab === "aktif" ? "Belum ada percakapan." : "Tidak ada percakapan diarsipkan."}
            </div>
          )}

          {items.map((c) => (
            <Link
              key={c.conversation_id}
              href={`/chat/${c.conversation_id}`}
              className="card p-3.5 flex items-center gap-3 hover:border-turquoise/50 transition-colors"
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white font-display font-bold overflow-hidden">
                  {c.other_avatar ? (
                    <img src={c.other_avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials(c.other_name)
                  )}
                </div>
                {c.other_online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-turquoise-dark border-2 border-white" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink truncate flex items-center gap-1.5">
                    {c.other_name || "Pengguna"}
                    {c.source_type === "marketplace" ? (
                      <ShoppingBag size={12} className="text-ink/30 shrink-0" />
                    ) : (
                      <Briefcase size={12} className="text-ink/30 shrink-0" />
                    )}
                  </p>
                  <span className="text-[11px] text-ink/40 shrink-0">{formatChatTime(c.last_message_at)}</span>
                </div>
                <p className="text-xs text-ink/50 truncate mb-0.5">{c.title}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className={clsx("text-sm truncate", c.unread_count > 0 ? "text-ink font-semibold" : "text-ink/50")}>
                    {c.is_dispute && <AlertTriangle size={12} className="inline mr-1 text-clay -mt-0.5" />}
                    {c.last_message || "Belum ada pesan"}
                  </p>
                  {c.unread_count > 0 && (
                    <span className="bg-clay text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0">
                      {c.unread_count > 9 ? "9+" : c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
