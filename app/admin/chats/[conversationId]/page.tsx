"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CHAT_BUCKET, formatChatTime } from "@/lib/chat-helpers";
import type { ChatMessage, ChatAttachment, DisputeStatus } from "@/lib/types";
import { DISPUTE_STATUS_LABEL } from "@/lib/types";
import { ArrowLeft, Send, FileText, ShieldCheck, Lock } from "lucide-react";
import clsx from "clsx";

export default function AdminChatThreadPage({ params }: { params: { conversationId: string } }) {
  const conversationId = params.conversationId;
  const supabase = createClient();

  const [adminId, setAdminId] = useState<string | null>(null);
  const [title, setTitle] = useState("Percakapan");
  const [isLocked, setIsLocked] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dispute, setDispute] = useState<any | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setAdminId(user?.id || null);

      const { data: convRow } = await supabase
        .from("conversations")
        .select("id, is_locked, job:jobs(title), order:digital_orders(listing:digital_listings(title))")
        .eq("id", conversationId)
        .single();
      if (convRow) {
        const jobRel = convRow.job as any;
        const orderRel = convRow.order as any;
        setTitle(jobRel?.title || orderRel?.listing?.title || "Percakapan");
        setIsLocked(convRow.is_locked);
      }

      const { data: mem } = await supabase
        .from("conversation_members")
        .select("profile_id, member_role, profiles(full_name, avatar_url)")
        .eq("conversation_id", conversationId);
      setMembers(mem || []);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*, attachments(*)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((msgs as ChatMessage[]) || []);

      const { data: disputeRow } = await supabase
        .from("disputes")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setDispute(disputeRow);

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-conversation-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, attachments: [] }]));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row, attachments: m.attachments } : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatAttachment;
          setMessages((prev) => prev.map((m) => (m.id === row.message_id ? { ...m, attachments: [...(m.attachments || []), row] } : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "disputes", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setDispute(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => setIsLocked((payload.new as any).is_locked)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !adminId) return;
    setSending(true);
    const content = text.trim();
    setText("");
    await supabase.rpc("admin_join_conversation", { p_conversation_id: conversationId });
    await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: adminId, content, message_type: "text" });
    setSending(false);
  }

  async function resolve(status: "selesai" | "ditolak") {
    if (!dispute) return;
    const note = prompt(status === "selesai" ? "Catatan penyelesaian (opsional):" : "Alasan penolakan (opsional):") || null;
    const { error } = await supabase.rpc("resolve_dispute", { p_dispute_id: dispute.id, p_status: status, p_note: note });
    if (error) alert(error.message);
  }

  async function signedUrl(path: string) {
    const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center gap-3 mb-3">
        <Link href="/admin/chats" className="p-1.5 text-ink/50 hover:text-ink">
          <ArrowLeft size={19} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold truncate flex items-center gap-2">
            {title}
            {isLocked && <Lock size={14} className="text-clay" />}
          </h1>
          <p className="text-xs text-ink/50 truncate">
            {members.map((m) => m.profiles?.full_name).filter(Boolean).join(" · ") || "-"}
          </p>
        </div>
        {dispute && (
          <span className={clsx("badge-stage text-[10px]", dispute.status === "selesai" || dispute.status === "ditolak" ? "stage-selesai" : "bg-clay/10 text-clay")}>
            {DISPUTE_STATUS_LABEL[dispute.status as DisputeStatus]}
          </span>
        )}
      </div>

      {dispute && (dispute.status === "menunggu_admin" || dispute.status === "diproses") && (
        <div className="card p-3 mb-3 flex items-center justify-between gap-3 bg-clay/5 border-clay/20">
          <p className="text-xs text-clay font-semibold">Tiket sengketa aktif — selesaikan setelah mediasi selesai.</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => resolve("selesai")} className="btn-primary !px-3 !py-1.5 text-xs gap-1">
              <ShieldCheck size={13} /> Tandai Selesai
            </button>
            <button onClick={() => resolve("ditolak")} className="!px-3 !py-1.5 text-xs rounded-pill border border-clay text-clay font-semibold">
              Tolak
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto card p-4 space-y-2 mb-3">
        {messages.map((m) => (
          <AdminBubble key={m.id} message={m} isAdminSender={members.find((mm) => mm.profile_id === m.sender_id)?.member_role === "admin"} signedUrl={signedUrl} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2">
        <input
          className="input flex-1 !py-3"
          placeholder="Balas sebagai Admin..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={sending || !text.trim()} className="btn-primary !px-4 !py-3">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

function AdminBubble({
  message,
  isAdminSender,
  signedUrl
}: {
  message: ChatMessage;
  isAdminSender: boolean;
  signedUrl: (path: string) => Promise<string | null>;
}) {
  if (message.is_system) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-ink/45 bg-line/50 px-3 py-1 rounded-pill">{message.content}</span>
      </div>
    );
  }
  return (
    <div className={clsx("flex", isAdminSender ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", isAdminSender ? "bg-ink text-white" : "bg-white border border-line")}>
        {isAdminSender && <p className="text-[10px] font-bold text-gold mb-0.5">ADMIN</p>}
        {message.deleted_at ? (
          <p className="italic opacity-60">Pesan telah dihapus</p>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.attachments?.map((att) => (
              <AdminAttachment key={att.id} attachment={att} signedUrl={signedUrl} />
            ))}
          </>
        )}
        <p className={clsx("text-[10px] mt-1", isAdminSender ? "text-white/60" : "text-ink/40")}>{formatChatTime(message.created_at)}</p>
      </div>
    </div>
  );
}

function AdminAttachment({ attachment, signedUrl }: { attachment: ChatAttachment; signedUrl: (path: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    signedUrl(attachment.file_url).then(setUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.file_url]);

  if (attachment.file_type === "image") {
    return (
      <a href={url || "#"} target="_blank" rel="noreferrer" className="block mt-1.5 rounded-xl overflow-hidden max-w-[200px]">
        {url && <img src={url} alt={attachment.file_name} className="w-full h-auto" />}
      </a>
    );
  }
  return (
    <a href={url || "#"} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2 border border-line bg-paper">
      <FileText size={16} className="shrink-0" />
      <span className="text-xs font-semibold truncate">{attachment.file_name}</span>
    </a>
  );
}
