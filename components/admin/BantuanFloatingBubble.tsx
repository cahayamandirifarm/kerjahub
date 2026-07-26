"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatChatTime, initials } from "@/lib/chat-helpers";
import { Headset, X } from "lucide-react";
import clsx from "clsx";

interface PendingBantuan {
  conversation_id: string;
  requester_id: string;
  requester_name: string | null;
  requester_avatar: string | null;
  last_message: string | null;
  last_message_at: string;
}

// Bubble mengambang di pojok kanan bawah, tampil di SEMUA halaman admin
// panel (dipasang di app/admin/layout.tsx). Realtime: begitu ada pesan
// chat bantuan baru dari pengguna yang belum ada admin menanganinya,
// badge merah langsung nambah tanpa admin perlu buka menu Monitoring
// Chat dulu. Begitu satu admin membalas (admin_join_conversation), tiket
// itu otomatis hilang dari daftar ini untuk SEMUA admin.
export default function BantuanFloatingBubble() {
  const supabase = createClient();
  const [items, setItems] = useState<PendingBantuan[]>([]);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  async function load() {
    const { data } = await supabase.rpc("list_pending_bantuan_conversations");
    setItems((data as PendingBantuan[]) || []);
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") return;
      setIsAdmin(true);
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-bantuan-bubble")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, load)
      .subscribe();

    // Fallback polling -- jaring pengaman kalau realtime putus, sama
    // seperti pola di halaman chat lain.
    const pollInterval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return null;

  const count = items.length;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 max-w-[calc(100vw-2.5rem)] max-h-[70vh] bg-white rounded-2xl shadow-xl border border-line overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
            <p className="font-display font-semibold text-ink text-sm">Chat Bantuan Menunggu</p>
            <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {count === 0 && <div className="p-6 text-center text-xs text-ink/40">Tidak ada permintaan bantuan yang menunggu.</div>}
            {items.map((it) => (
              <Link
                key={it.conversation_id}
                href={`/admin/chats/${it.conversation_id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-3 border-b border-line/60 last:border-0 hover:bg-paper transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white text-xs font-display font-bold shrink-0 overflow-hidden">
                  {it.requester_avatar ? (
                    <img src={it.requester_avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials(it.requester_name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{it.requester_name || "Pengguna"}</p>
                  <p className="text-xs text-ink/50 truncate">{it.last_message || "Belum ada pesan"}</p>
                </div>
                <span className="text-[10px] text-ink/35 shrink-0">{formatChatTime(it.last_message_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat bantuan menunggu"
        className={clsx(
          "relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105",
          count > 0 ? "bg-clay" : "bg-turquoise"
        )}
      >
        {count > 0 && <span className="absolute inset-0 rounded-full bg-clay animate-ping opacity-60" />}
        <Headset size={24} className="relative" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-white text-clay text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center border-2 border-clay">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
    </div>
  );
}
