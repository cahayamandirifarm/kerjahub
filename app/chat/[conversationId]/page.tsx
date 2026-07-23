"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { notifyActiveConversation } from "@/lib/push";
import Navbar from "@/components/Navbar";
import type { ChatMessage, ChatAttachment, NegoOffer } from "@/lib/types";
import { NEGO_QUICK_AMOUNTS } from "@/lib/types";
import {
  CHAT_BUCKET,
  MAX_ATTACHMENT_MB,
  QUICK_EMOJIS,
  detectFileType,
  formatChatTime,
  formatFileSize,
  initials,
  isTanyaAdmin
} from "@/lib/chat-helpers";
import {
  Send,
  ArrowLeft,
  Paperclip,
  Smile,
  Reply,
  Pencil,
  Trash2,
  X,
  MoreVertical,
  Archive,
  ShieldBan,
  ShieldCheck,
  Search,
  AlertTriangle,
  FileText,
  Loader2,
  Check,
  CheckCheck,
  ExternalLink,
  Briefcase,
  ShoppingBag,
  Tags,
  Wallet
} from "lucide-react";
import clsx from "clsx";

interface OtherProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_online: boolean;
}

interface ConversationInfo {
  id: string;
  source_type: "job" | "marketplace" | "listing";
  title: string;
  is_locked: boolean;
  is_dispute: boolean;
  contextUrl: string | null;
  contextLabel: string | null;
  jobId: string | null;
  jobIsNego: boolean;
  jobStage: string | null;
  jobClientId: string | null;
}

const PAGE_SIZE = 30;

export default function ChatDetailPage({ params }: { params: { conversationId: string } }) {
  const conversationId = params.conversationId;
  const router = useRouter();
  const supabase = createClient();
  const { activeJob } = useActiveJobLock();

  const [userId, setUserId] = useState<string | null>(null);
  const [conv, setConv] = useState<ConversationInfo | null>(null);
  const [other, setOther] = useState<OtherProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [otherReadStatus, setOtherReadStatus] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [negoOpen, setNegoOpen] = useState(false);
  const [negoCustomAmount, setNegoCustomAmount] = useState("");
  const [negoSending, setNegoSending] = useState(false);
  const [negoError, setNegoError] = useState<string | null>(null);
  const [negoRespondingId, setNegoRespondingId] = useState<string | null>(null);
  const [negoOffersMap, setNegoOffersMap] = useState<Record<string, NegoOffer>>({});
  const otherIdRef = useRef<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // -------------------- initial load --------------------
  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/chat/${conversationId}`);
        return;
      }
      setUserId(user.id);

      // Ambil kolom flat dulu (tanpa embed bertingkat). Query embed PostgREST
      // (mis. order:digital_orders(listing:digital_listings(title))) gagal
      // total kalau schema cache Supabase belum di-reload setelah migrasi
      // baru (mis. kolom listing_id dari 0010_pre_deal_chat.sql), dan
      // sebelumnya itu menyebabkan HALAMAN INI LANGSUNG REDIRECT DIAM-DIAM
      // ke /chat untuk SEMUA jenis percakapan, bukan cuma yang baru.
      const { data: convRow, error: convErr } = await supabase
        .from("conversations")
        .select("id, source_type, job_id, order_id, listing_id, is_locked, is_dispute")
        .eq("id", conversationId)
        .single();

      if (convErr || !convRow) {
        console.error("Gagal memuat percakapan:", convErr);
        // PGRST116 = baris tidak ditemukan (mis. bukan anggota / sudah dihapus).
        // Untuk error lain (relationship/schema/koneksi) jangan langsung
        // tendang balik ke daftar chat tanpa keterangan — tampilkan pesan.
        if (convErr?.code === "PGRST116") {
          router.push("/chat");
        } else {
          setLoadError(
            convErr?.message || "Gagal memuat percakapan. Coba lagi beberapa saat."
          );
        }
        return;
      }

      // Judul percakapan + link ke lowongan/produk terkait diambil terpisah
      // per source_type supaya kegagalan salah satu lookup (mis. tabel/relasi
      // belum sinkron) tidak menggagalkan seluruh halaman — cukup fallback
      // ke "Percakapan" tanpa link.
      let title = "Percakapan";
      let contextUrl: string | null = null;
      let jobIsNego = false;
      let jobStage: string | null = null;
      let jobClientId: string | null = null;
      try {
        if (convRow.source_type === "job" && convRow.job_id) {
          const { data } = await supabase.from("jobs").select("title, is_nego, stage, client_id").eq("id", convRow.job_id).single();
          if (data?.title) title = data.title;
          if (data) {
            jobIsNego = !!data.is_nego;
            jobStage = data.stage;
            jobClientId = data.client_id;
          }
          contextUrl = `/jobs/${convRow.job_id}`;
        } else if (convRow.source_type === "marketplace" && convRow.order_id) {
          const { data: order } = await supabase
            .from("digital_orders")
            .select("listing_id")
            .eq("id", convRow.order_id)
            .single();
          if (order?.listing_id) {
            const { data: listing } = await supabase
              .from("digital_listings")
              .select("title")
              .eq("id", order.listing_id)
              .single();
            if (listing?.title) title = listing.title;
            contextUrl = `/marketplace/${order.listing_id}`;
          }
        } else if (convRow.source_type === "listing" && convRow.listing_id) {
          const { data } = await supabase
            .from("digital_listings")
            .select("title")
            .eq("id", convRow.listing_id)
            .single();
          if (data?.title) title = data.title;
          contextUrl = `/marketplace/${convRow.listing_id}`;
        }
      } catch (titleErr) {
        console.error("Gagal memuat judul percakapan:", titleErr);
      }

      setConv({
        id: convRow.id,
        source_type: convRow.source_type,
        title,
        is_locked: convRow.is_locked,
        is_dispute: convRow.is_dispute,
        contextUrl,
        contextLabel: convRow.source_type === "job" ? "Lihat lowongan" : "Lihat produk",
        jobId: convRow.job_id || null,
        jobIsNego,
        jobStage,
        jobClientId
      });

      const { data: members } = await supabase
        .from("conversation_members")
        .select("profile_id, is_archived, profiles(id, full_name, avatar_url, is_online)")
        .eq("conversation_id", conversationId);

      const me = members?.find((m: any) => m.profile_id === user.id);
      const otherMember = members?.find((m: any) => m.profile_id !== user.id);
      setIsArchived(!!me?.is_archived);
      if (otherMember?.profiles) setOther(otherMember.profiles as any as OtherProfile);

      const otherId = (otherMember?.profiles as any)?.id;
      otherIdRef.current = otherId || null;
      if (otherId) {
        const { data: blocks } = await supabase
          .from("blocked_users")
          .select("blocker_id, blocked_id")
          .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`);
        setBlockedByMe(!!blocks?.some((b) => b.blocker_id === user.id));
        setBlockedByOther(!!blocks?.some((b) => b.blocker_id === otherId));
      }

      const { data: msgs, error: msgsError } = await supabase
        .from("messages")
        .select("*, attachments(*), nego_offers!messages_nego_offer_id_fkey(*)")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (msgsError) setLoadError(msgsError.message);

      const ordered = (msgs || []).slice().reverse() as ChatMessage[];
      setMessages(ordered);
      setHasMore((msgs || []).length === PAGE_SIZE);
      setNegoOffersMap((prev) => {
        const next = { ...prev };
        ordered.forEach((m) => {
          if (m.nego_offers) next[m.nego_offers.id] = m.nego_offers;
        });
        return next;
      });

      if (otherId && ordered.length) {
        const { data: reads } = await supabase
          .from("message_reads")
          .select("message_id, status")
          .eq("profile_id", otherId)
          .in("message_id", ordered.map((m) => m.id));
        const map: Record<string, string> = {};
        reads?.forEach((r) => (map[r.message_id] = r.status));
        setOtherReadStatus(map);
      }

      await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
      setTimeout(() => scrollToBottom("auto"), 50);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // -------------------- realtime: messages + reads --------------------
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, attachments: [] }]));
          setTimeout(() => scrollToBottom(), 50);
          if (row.nego_offer_id) {
            const { data: offer } = await supabase.from("nego_offers").select("*").eq("id", row.nego_offer_id).single();
            if (offer) {
              setNegoOffersMap((prev) => ({ ...prev, [offer.id]: offer as NegoOffer }));
              setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, nego_offers: offer as NegoOffer } : m)));
            }
          }
          if (row.sender_id !== userId) {
            await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
          }
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
          setMessages((prev) =>
            prev.map((m) => (m.id === row.message_id ? { ...m, attachments: [...(m.attachments || []), row] } : m))
          );
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_reads" }, (payload) => {
        const row = payload.new as { message_id: string; profile_id: string; status: string };
        if (row.profile_id !== otherIdRef.current) return;
        setOtherReadStatus((prev) => ({ ...prev, [row.message_id]: row.status }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const row = payload.new as { message_id: string; profile_id: string; status: string };
        if (row.profile_id !== otherIdRef.current) return;
        setOtherReadStatus((prev) => ({ ...prev, [row.message_id]: row.status }));
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as any;
          setConv((prev) => (prev ? { ...prev, is_locked: row.is_locked, is_dispute: row.is_dispute } : prev));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "nego_offers", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as NegoOffer;
          setNegoOffersMap((prev) => ({ ...prev, [row.id]: row }));
          setMessages((prev) => prev.map((m) => (m.nego_offer_id === row.id ? { ...m, nego_offers: row } : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs" },
        (payload) => {
          const row = payload.new as any;
          setConv((prev) =>
            prev && prev.jobId === row.id
              ? { ...prev, jobIsNego: !!row.is_nego, jobStage: row.stage, jobClientId: row.client_id ?? prev.jobClientId }
              : prev
          );
        }
      )
      .subscribe();

    // Fallback polling — jaring pengaman kalau koneksi realtime (WebSocket)
    // putus/gagal reconnect (umum di jaringan seluler yang tidak stabil).
    // Ambil pesan yang lebih baru dari pesan terakhir yang sudah ada di
    // layar; kalau realtime bekerja normal ini hampir selalu kosong.
    const pollInterval = setInterval(async () => {
      if (document.hidden) return;
      setMessages((prev) => {
        const lastCreatedAt = prev.length ? prev[prev.length - 1].created_at : null;
        if (!lastCreatedAt) return prev;
        supabase
          .from("messages")
          .select("*, attachments(*)")
          .eq("conversation_id", conversationId)
          .gt("created_at", lastCreatedAt)
          .order("created_at", { ascending: true })
          .then(({ data }) => {
            if (!data || !data.length) return;
            setMessages((cur) => {
              const known = new Set(cur.map((m) => m.id));
              const fresh = (data as ChatMessage[]).filter((m) => !known.has(m.id));
              if (!fresh.length) return cur;
              setTimeout(() => scrollToBottom(), 50);
              return [...cur, ...fresh];
            });
          });
        return prev;
      });
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`presence-${conversationId}`, { config: { presence: { key: userId } } });
    presenceChannelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId === userId) return;
        setRemoteTyping(!!payload.payload.typing);
        if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
        if (payload.payload.typing) {
          remoteTypingTimeoutRef.current = setTimeout(() => setRemoteTyping(false), 4000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId]);

  // Kalau job dari percakapan ini berubah jadi 'menunggu_pembayaran' dan
  // akun yang sedang login adalah pembayarnya (mis. tawaran nego baru saja
  // disetujui pihak lain), arahkan otomatis ke halaman pop-up pembayaran --
  // tanpa perlu pembayar menekan tombol apa pun.
  useEffect(() => {
    if (!conv?.jobId || !activeJob) return;
    if (activeJob.job_id !== conv.jobId) return;
    if (activeJob.stage !== "menunggu_pembayaran") return;
    if (activeJob.my_role !== "employer") return; // 'employer' = pembayar
    if (!activeJob.escrow_id) return;
    router.push(`/dashboard/employer/escrow/${activeJob.escrow_id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob, conv?.jobId]);

  // live is_online untuk lawan bicara
  useEffect(() => {
    if (!other?.id) return;
    const channel = supabase
      .channel(`profile-online-${other.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${other.id}` },
        (payload) => {
          const row = payload.new as any;
          setOther((prev) => (prev ? { ...prev, is_online: row.is_online } : prev));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other?.id]);

  function broadcastTyping(typing: boolean) {
    presenceChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId, typing } });
  }

  function handleTextChange(v: string) {
    setText(v);
    broadcastTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000);
  }

  // beri tahu service worker percakapan ini sedang dibuka, supaya push
  // notification untuk chat ini tidak dobel dengan toast in-app.
  useEffect(() => {
    notifyActiveConversation(conversationId);
    return () => notifyActiveConversation(null);
  }, [conversationId]);

  const isBlocked = blockedByMe || blockedByOther;

  // -------------------- send / edit / delete --------------------
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !userId || isBlocked) return;
    const content = text.trim();
    setText("");
    broadcastTyping(false);
    const replyToId = replyTo?.id ?? null;
    setReplyTo(null);
    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
        reply_to_id: replyToId,
        message_type: "text"
      })
      .select("*, attachments(*)")
      .single();
    // Tampilkan pesan sendiri LANGSUNG dari hasil insert, jangan tunggu event
    // realtime pantul balik — kalau koneksi realtime lambat/putus, pesan
    // baru kelihatan setelah reload. Event realtime tetap dipakai untuk
    // pesan dari lawan bicara (dan di-dedupe lewat pengecekan id di bawah).
    if (!insErr && inserted) {
      setMessages((prev) => (prev.some((m) => m.id === (inserted as any).id) ? prev : [...prev, inserted as any]));
      setTimeout(() => scrollToBottom(), 50);
    } else if (insErr) {
      console.error("Gagal mengirim pesan:", insErr);
      setText(content);
      alert("Pesan gagal terkirim. Coba lagi.");
    }
    // kalau isi pesan /tanyaadmin, trigger DB otomatis mengunci percakapan &
    // membuat tiket sengketa — UI ikut update lewat langganan realtime di atas.
  }

  async function saveEdit(messageId: string) {
    if (!editText.trim()) return;
    await supabase.from("messages").update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq("id", messageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m))
    );
    setEditingId(null);
    setEditText("");
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Hapus pesan ini?")) return;
    await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m)));
  }

  // -------------------- nego harga --------------------
  async function submitNegoOffer(amount: number) {
    if (!amount || amount <= 0 || negoSending) return;
    setNegoSending(true);
    setNegoError(null);
    const { data, error } = await supabase.rpc("send_nego_offer", {
      p_conversation_id: conversationId,
      p_amount: amount
    });
    setNegoSending(false);
    if (error) {
      setNegoError(error.message || "Gagal mengirim tawaran harga. Coba lagi.");
      return;
    }
    // Jangan cuma andalkan realtime buat nampilin bubble nominal tawaran --
    // di koneksi yang kurang stabil realtime bisa telat/gagal sehingga
    // nominal sempat/permanen tampil Rp0. Ambil langsung datanya di sini.
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.offer_id) {
      const { data: offerRow } = await supabase.from("nego_offers").select("*").eq("id", result.offer_id).single();
      if (offerRow) setNegoOffersMap((prev) => ({ ...prev, [offerRow.id]: offerRow as NegoOffer }));
    }
    setNegoOpen(false);
    setNegoCustomAmount("");
    setTimeout(() => scrollToBottom(), 100);
  }

  async function respondNego(offerId: string, accept: boolean) {
    if (negoRespondingId) return;
    setNegoRespondingId(offerId);
    const { data, error } = await supabase.rpc("respond_nego_offer", { p_offer_id: offerId, p_accept: accept });
    setNegoRespondingId(null);
    if (error) {
      alert(error.message || "Gagal merespons tawaran. Coba lagi.");
      return;
    }
    // Update status tawaran secara lokal juga (jangan tunggu realtime),
    // supaya "✓ Tawaran diterima" langsung tampil di sisi yang menekan tombol.
    setNegoOffersMap((prev) =>
      prev[offerId] ? { ...prev, [offerId]: { ...prev[offerId], status: accept ? "diterima" : "ditolak" } } : prev
    );
    if (accept) {
      // Harga disepakati -> langsung arahkan pihak pembayar ke halaman
      // pop-up pembayaran escrow (persis alur terima lamaran biasa).
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.escrow_id && result?.payer_id && result.payer_id === userId) {
        router.push(`/dashboard/employer/escrow/${result.escrow_id}`);
      }
    } else {
      // "Nego lagi" -> buka lagi panel pengajuan tawaran supaya bisa
      // langsung kirim nominal baru.
      setNegoOpen(true);
      setTimeout(() => scrollToBottom(), 100);
    }
  }

  // Dipakai tombol "Bayar Sekarang" di bubble tawaran yang sudah disepakati
  // -- untuk pihak pembayar yang tidak menekan tombol Setujui sendiri (mis.
  // baru buka/refresh chat setelah pihak lain menyetujui dari HP lain).
  async function openPaymentForJob() {
    if (!conv?.jobId) return;
    if (activeJob && activeJob.job_id === conv.jobId && activeJob.escrow_id) {
      router.push(`/dashboard/employer/escrow/${activeJob.escrow_id}`);
      return;
    }
    const { data } = await supabase
      .from("escrow_payments")
      .select("id")
      .eq("job_id", conv.jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      router.push(`/dashboard/employer/escrow/${data.id}`);
    } else {
      alert("Data pembayaran belum ditemukan, coba refresh halaman ini.");
    }
  }

  async function cancelNego(offerId: string) {
    if (negoRespondingId) return;
    setNegoRespondingId(offerId);
    const { error } = await supabase.rpc("cancel_nego_offer", { p_offer_id: offerId });
    setNegoRespondingId(null);
    if (error) {
      alert(error.message || "Gagal membatalkan tawaran. Coba lagi.");
      return;
    }
    setNegoOffersMap((prev) => (prev[offerId] ? { ...prev, [offerId]: { ...prev[offerId], status: "dibatalkan" } } : prev));
  }

  // -------------------- attachments --------------------
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      alert(`Ukuran file maksimal ${MAX_ATTACHMENT_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const fileType = detectFileType(file);
      const path = `${conversationId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(CHAT_BUCKET).upload(path, file);
      if (upErr) throw upErr;

      const { data: msgRow, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: file.name,
          message_type: fileType === "image" ? "image" : "document"
        })
        .select()
        .single();
      if (msgErr || !msgRow) throw msgErr;

      await supabase.from("attachments").insert({
        message_id: msgRow.id,
        conversation_id: conversationId,
        uploaded_by: userId,
        file_url: path,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size
      });
    } catch (err) {
      console.error(err);
      alert("Gagal mengunggah file. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  // -------------------- pagination --------------------
  async function loadOlder() {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollAreaRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data } = await supabase
      .from("messages")
      .select("*, attachments(*), nego_offers!messages_nego_offer_id_fkey(*)")
      .eq("conversation_id", conversationId)
      .lt("created_at", messages[0].created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const older = (data || []).slice().reverse() as ChatMessage[];
    setMessages((prev) => [...older, ...prev]);
    setHasMore((data || []).length === PAGE_SIZE);
    setNegoOffersMap((prev) => {
      const next = { ...prev };
      older.forEach((m) => {
        if (m.nego_offers) next[m.nego_offers.id] = m.nego_offers;
      });
      return next;
    });
    setLoadingOlder(false);
    if (otherIdRef.current && older.length) {
      const { data: reads } = await supabase
        .from("message_reads")
        .select("message_id, status")
        .eq("profile_id", otherIdRef.current)
        .in("message_id", older.map((m) => m.id));
      if (reads?.length) {
        setOtherReadStatus((prev) => {
          const next = { ...prev };
          reads.forEach((r) => (next[r.message_id] = r.status));
          return next;
        });
      }
    }
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  // -------------------- archive / block --------------------
  async function toggleArchive() {
    if (!userId) return;
    const next = !isArchived;
    setIsArchived(next);
    setMenuOpen(false);
    await supabase.from("conversation_members").update({ is_archived: next }).eq("conversation_id", conversationId).eq("profile_id", userId);
  }

  async function toggleBlock() {
    if (!userId || !other?.id) return;
    setMenuOpen(false);
    if (blockedByMe) {
      await supabase.from("blocked_users").delete().eq("blocker_id", userId).eq("blocked_id", other.id);
      setBlockedByMe(false);
    } else {
      if (!confirm(`Blokir ${other.full_name}? Kamu tidak akan bisa saling mengirim pesan lagi.`)) return;
      await supabase.from("blocked_users").insert({ blocker_id: userId, blocked_id: other.id });
      setBlockedByMe(true);
    }
  }

  async function attachmentSignedUrl(path: string) {
    const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }

  const visibleMessages =
    searchOpen && searchQuery.trim()
      ? messages.filter((m) => !m.deleted_at && m.content.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : messages;

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-3">
        <AlertTriangle className="text-clay" size={28} />
        <p className="text-sm text-ink/70 max-w-xs">{loadError}</p>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="btn-primary !px-4 !py-2 text-sm">
            Coba lagi
          </button>
          <button onClick={() => router.push("/chat")} className="px-4 py-2 text-sm rounded-pill border border-line">
            Kembali
          </button>
        </div>
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink/40">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="sticky top-16 z-20 bg-white/95 backdrop-blur-glass border-b border-line/70">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center gap-3">
          <button onClick={() => router.push("/chat")} className="p-1.5 text-ink/50 hover:text-ink shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-display font-bold overflow-hidden">
              {other?.avatar_url ? (
                <img src={other.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                initials(other?.full_name)
              )}
            </div>
            {other?.is_online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-turquoise-dark border-2 border-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink truncate leading-tight">{other?.full_name || "Pengguna"}</p>
            <p className="text-xs text-ink/45 truncate">
              {remoteTyping ? <span className="text-turquoise-dark font-semibold">sedang mengetik...</span> : conv.title}
            </p>
          </div>
          <button onClick={() => setSearchOpen((s) => !s)} className="p-2 text-ink/50 hover:text-ink shrink-0">
            <Search size={18} />
          </button>
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen((s) => !s)} className="p-2 text-ink/50 hover:text-ink">
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 w-56 card p-1.5 z-30">
                <button onClick={toggleArchive} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-turquoise-light/50 text-left">
                  <Archive size={15} /> {isArchived ? "Batalkan arsip" : "Arsipkan percakapan"}
                </button>
                <button onClick={toggleBlock} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-clay hover:bg-clay/5 text-left">
                  {blockedByMe ? <ShieldCheck size={15} /> : <ShieldBan size={15} />}
                  {blockedByMe ? "Batalkan blokir" : "Blokir pengguna"}
                </button>
              </div>
            )}
          </div>
        </div>
        {searchOpen && (
          <div className="max-w-lg mx-auto px-3 pb-3">
            <input
              autoFocus
              className="input !py-2.5"
              placeholder="Cari pesan di percakapan ini..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
        {conv.contextUrl && (
          <div className="max-w-lg mx-auto px-3 pb-2.5">
            <a
              href={conv.contextUrl}
              className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs hover:border-turquoise/50 transition-colors"
            >
              {conv.source_type === "job" ? (
                <Briefcase size={14} className="text-turquoise-dark shrink-0" />
              ) : (
                <ShoppingBag size={14} className="text-turquoise-dark shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-ink/70">
                {conv.contextLabel}: <span className="font-semibold text-ink">{conv.title}</span>
              </span>
              <ExternalLink size={13} className="text-ink/35 shrink-0" />
            </a>
          </div>
        )}
        {conv.jobIsNego && conv.jobStage === "terbuka" && !conv.is_locked && (
          <div className="max-w-lg mx-auto px-3 pb-2.5">
            <button
              onClick={() => setNegoOpen((s) => !s)}
              disabled={isBlocked}
              className="w-full flex items-center gap-2 rounded-xl border border-turquoise/40 bg-turquoise-light/40 px-3 py-2 text-xs font-semibold text-turquoise-dark disabled:opacity-50"
            >
              <Tags size={14} className="shrink-0" />
              <span className="flex-1 text-left">Postingan ini pakai harga Nego — ajukan tawaran harga</span>
            </button>
          </div>
        )}
        {conv.is_locked && (
          <div className="bg-clay/10 text-clay text-xs font-semibold px-4 py-2 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Sengketa sedang ditangani admin — riwayat percakapan terkunci sebagai bukti.
          </div>
        )}
      </div>

      <div ref={scrollAreaRef} className="flex-1 max-w-lg w-full mx-auto px-4 py-4 overflow-y-auto space-y-1.5">
        {hasMore && !searchOpen && (
          <div className="text-center pb-2">
            <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-semibold text-turquoise-dark disabled:opacity-50">
              {loadingOlder ? "Memuat..." : "Muat pesan lama"}
            </button>
          </div>
        )}

        {visibleMessages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isMine={m.sender_id === userId}
            allMessages={messages}
            editingId={editingId}
            editText={editText}
            onStartEdit={() => {
              setEditingId(m.id);
              setEditText(m.content);
            }}
            onCancelEdit={() => setEditingId(null)}
            onChangeEditText={setEditText}
            onSaveEdit={() => saveEdit(m.id)}
            onDelete={() => deleteMessage(m.id)}
            onReply={() => setReplyTo(m)}
            canModify={!conv.is_locked}
            getSignedUrl={attachmentSignedUrl}
            readStatus={otherReadStatus[m.id]}
            negoOffer={m.nego_offer_id ? negoOffersMap[m.nego_offer_id] || m.nego_offers || null : null}
            negoRespondingId={negoRespondingId}
            onAcceptNego={(offerId) => respondNego(offerId, true)}
            onRejectNego={(offerId) => respondNego(offerId, false)}
            onCancelNego={(offerId) => cancelNego(offerId)}
            isPayerViewer={!!conv.jobClientId && conv.jobClientId === userId}
            jobStage={conv.jobStage}
            onOpenPayment={openPaymentForJob}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="max-w-lg w-full mx-auto px-4 pb-4">
        {isBlocked && (
          <p className="text-xs text-clay font-semibold mb-2 text-center">
            {blockedByMe ? "Kamu memblokir pengguna ini. Batalkan blokir untuk mengirim pesan." : "Kamu tidak bisa mengirim pesan ke pengguna ini."}
          </p>
        )}
        {replyTo && (
          <div className="flex items-center justify-between bg-turquoise-light/50 rounded-xl px-3 py-2 mb-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-turquoise-dark">Membalas</p>
              <p className="text-xs text-ink/60 truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-ink/40 hover:text-ink shrink-0 ml-2">
              <X size={15} />
            </button>
          </div>
        )}
        {showEmoji && (
          <div className="card p-2 mb-2 flex flex-wrap gap-1">
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => {
                  setText((t) => t + em);
                  setShowEmoji(false);
                }}
                className="text-xl p-1.5 hover:bg-turquoise-light/50 rounded-lg"
              >
                {em}
              </button>
            ))}
          </div>
        )}
        {negoOpen && (
          <div className="card p-3 mb-2 space-y-2.5">
            <p className="text-xs font-semibold text-ink/70">Ajukan tawaran harga</p>
            <div className="flex flex-wrap gap-1.5">
              {NEGO_QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => submitNegoOffer(amt)}
                  disabled={negoSending}
                  className="px-3 py-1.5 rounded-pill border border-turquoise/40 text-xs font-semibold text-turquoise-dark hover:bg-turquoise-light/50 disabled:opacity-50"
                >
                  Rp{amt.toLocaleString("id-ID")}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1000}
                className="input flex-1 !py-2 text-sm"
                placeholder="Isi nominal lainnya"
                value={negoCustomAmount}
                onChange={(e) => setNegoCustomAmount(e.target.value)}
              />
              <button
                type="button"
                disabled={negoSending || !negoCustomAmount || Number(negoCustomAmount) <= 0}
                onClick={() => submitNegoOffer(Number(negoCustomAmount))}
                className="btn-primary !px-3 !py-2 text-sm shrink-0"
              >
                {negoSending ? <Loader2 size={16} className="animate-spin" /> : "Kirim"}
              </button>
            </div>
            {negoError && <p className="text-xs text-clay">{negoError}</p>}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex items-end gap-1.5">
          <input ref={fileInputRef} type="file" hidden accept="image/*,application/pdf,.doc,.docx" onChange={handleFileSelect} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBlocked || uploading}
            className="p-3 text-ink/45 hover:text-turquoise-dark shrink-0 disabled:opacity-40"
          >
            {uploading ? <Loader2 size={19} className="animate-spin" /> : <Paperclip size={19} />}
          </button>
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            disabled={isBlocked}
            className="p-3 text-ink/45 hover:text-turquoise-dark shrink-0 disabled:opacity-40"
          >
            <Smile size={19} />
          </button>
          <input
            className="input flex-1 !py-3"
            placeholder={isBlocked ? "Tidak bisa mengirim pesan" : "Tulis pesan... (ketik /tanyaadmin untuk bantuan admin)"}
            value={text}
            disabled={isBlocked}
            onChange={(e) => handleTextChange(e.target.value)}
          />
          <button type="submit" disabled={isBlocked || !text.trim()} className="btn-primary !px-4 !py-3 shrink-0">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isMine,
  allMessages,
  editingId,
  editText,
  onStartEdit,
  onCancelEdit,
  onChangeEditText,
  onSaveEdit,
  onDelete,
  onReply,
  canModify,
  getSignedUrl,
  readStatus,
  negoOffer,
  negoRespondingId,
  onAcceptNego,
  onRejectNego,
  onCancelNego,
  isPayerViewer,
  jobStage,
  onOpenPayment
}: {
  message: ChatMessage;
  isMine: boolean;
  allMessages: ChatMessage[];
  editingId: string | null;
  editText: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEditText: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  canModify: boolean;
  getSignedUrl: (path: string) => Promise<string | null>;
  readStatus?: string;
  negoOffer?: NegoOffer | null;
  negoRespondingId?: string | null;
  onAcceptNego?: (offerId: string) => void;
  onRejectNego?: (offerId: string) => void;
  onCancelNego?: (offerId: string) => void;
  isPayerViewer?: boolean;
  jobStage?: string | null;
  onOpenPayment?: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isEditing = editingId === message.id;
  const repliedTo = message.reply_to_id ? allMessages.find((m) => m.id === message.reply_to_id) : null;

  if (message.is_system) {
    const isDealMessage = !!message.nego_offer_id && message.content.startsWith("Harga disepakati");
    return (
      <div className="flex flex-col items-center py-1.5 gap-1.5">
        <span className="text-[11px] text-ink/45 bg-line/50 px-3 py-1.5 rounded-pill text-center max-w-[85%]">{message.content}</span>
        {isDealMessage && isPayerViewer && jobStage === "menunggu_pembayaran" && (
          <button
            onClick={() => onOpenPayment?.()}
            className="btn-primary !py-1.5 !px-4 text-xs flex items-center gap-1.5"
          >
            <Wallet size={13} />
            Bayar Sekarang
          </button>
        )}
      </div>
    );
  }

  if (message.message_type === "nego_offer") {
    const offer = negoOffer;
    const isResponding = !!offer && negoRespondingId === offer.id;
    return (
      <div className={clsx("flex", isMine ? "justify-end" : "justify-start")}>
        <div className={clsx("rounded-2xl px-4 py-3 text-sm max-w-[85%] border", isMine ? "bg-turquoise-light/40 border-turquoise/40" : "bg-white border-line")}>
          <p className="text-[11px] font-semibold text-turquoise-dark uppercase tracking-wide">Tawaran Harga</p>
          <p className="font-display text-xl font-semibold text-ink mt-0.5">
            Rp{(offer?.amount ?? 0).toLocaleString("id-ID")}
          </p>

          {offer?.status === "menunggu" && !isMine && canModify && (
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => onAcceptNego?.(offer.id)}
                disabled={isResponding}
                className="btn-primary !py-1.5 !px-3 text-xs flex-1 disabled:opacity-50"
              >
                {isResponding ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Setujui Harga"}
              </button>
              <button
                onClick={() => onRejectNego?.(offer.id)}
                disabled={isResponding}
                className="py-1.5 px-3 text-xs flex-1 rounded-pill border border-turquoise/40 text-turquoise-dark font-semibold disabled:opacity-50"
              >
                Nego Lagi
              </button>
            </div>
          )}

          {offer?.status === "menunggu" && isMine && canModify && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-ink/50">Menunggu respons...</span>
              <button
                onClick={() => onCancelNego?.(offer.id)}
                disabled={isResponding}
                className="text-xs font-semibold text-clay underline disabled:opacity-50"
              >
                {isResponding ? "..." : "Batalkan"}
              </button>
            </div>
          )}

          {offer?.status === "diterima" && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-turquoise-dark">✓ Tawaran diterima</p>
              {isPayerViewer && jobStage === "menunggu_pembayaran" && (
                <button
                  onClick={() => onOpenPayment?.()}
                  className="btn-primary w-full !py-2 text-xs mt-2 flex items-center justify-center gap-1.5"
                >
                  <Wallet size={14} />
                  Bayar Sekarang
                </button>
              )}
            </div>
          )}
          {offer?.status === "ditolak" && <p className="text-xs font-semibold text-clay mt-2">✕ Tawaran ditolak</p>}
          {offer?.status === "dibatalkan" && <p className="text-xs text-ink/40 mt-2">Tawaran dibatalkan</p>}

          <span className="block text-[10px] text-ink/40 mt-1.5">{formatChatTime(message.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx("group flex", isMine ? "justify-end" : "justify-start")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={clsx("flex items-end gap-1.5 max-w-[80%]", isMine && "flex-row-reverse")}>
        {!isMine && showActions && (
          <button onClick={onReply} className="p-1 text-ink/30 hover:text-turquoise-dark">
            <Reply size={14} />
          </button>
        )}
        <div
          className={clsx(
            "rounded-2xl px-4 py-2.5 text-sm",
            isMine ? "bg-turquoise text-white" : "bg-white border border-line text-ink"
          )}
        >
          {repliedTo && (
            <div className={clsx("border-l-2 pl-2 mb-1.5 text-xs opacity-75", isMine ? "border-white/60" : "border-turquoise")}>
              {repliedTo.deleted_at ? "Pesan telah dihapus" : repliedTo.content}
            </div>
          )}

          {message.deleted_at ? (
            <p className="italic opacity-60">Pesan telah dihapus</p>
          ) : isEditing ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={editText}
                onChange={(e) => onChangeEditText(e.target.value)}
                className="text-ink text-sm rounded-lg px-2 py-1 flex-1 border border-line"
              />
              <button onClick={onSaveEdit} className="text-xs font-semibold underline">
                Simpan
              </button>
              <button onClick={onCancelEdit} className="text-xs underline opacity-70">
                Batal
              </button>
            </div>
          ) : (
            <>
              {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
              {message.attachments?.map((att) => (
                <AttachmentView key={att.id} attachment={att} isMine={isMine} getSignedUrl={getSignedUrl} />
              ))}
              {message.edited_at && <span className="text-[10px] opacity-60 italic"> (diedit)</span>}
            </>
          )}

          <div className={clsx("flex items-center gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
            <span className={clsx("text-[10px]", isMine ? "text-white/70" : "text-ink/40")}>{formatChatTime(message.created_at)}</span>
            {isMine && !message.deleted_at && <ReadTick status={readStatus} />}
          </div>
        </div>

        {isMine && showActions && !message.deleted_at && canModify && (
          <div className="flex flex-col gap-1">
            <button onClick={onStartEdit} className="p-1 text-ink/30 hover:text-turquoise-dark">
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="p-1 text-ink/30 hover:text-clay">
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {isMine && showActions && (
          <button onClick={onReply} className="p-1 text-ink/30 hover:text-turquoise-dark self-start">
            <Reply size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function ReadTick({ status }: { status?: string }) {
  if (status === "dibaca") return <CheckCheck size={13} className="text-white/90" />;
  if (status === "diterima") return <CheckCheck size={13} className="text-white/60" />;
  return <Check size={13} className="text-white/70" />;
}

function AttachmentView({
  attachment,
  isMine,
  getSignedUrl
}: {
  attachment: ChatAttachment;
  isMine: boolean;
  getSignedUrl: (path: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    getSignedUrl(attachment.file_url).then(setUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.file_url]);

  if (attachment.file_type === "image") {
    return (
      <a href={url || "#"} target="_blank" rel="noreferrer" className="block mt-1.5 rounded-xl overflow-hidden max-w-[220px]">
        {url ? <img src={url} alt={attachment.file_name} className="w-full h-auto" /> : <div className="h-32 bg-black/5 animate-pulse rounded-xl" />}
      </a>
    );
  }

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        "mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2.5 border",
        isMine ? "border-white/30 bg-white/10" : "border-line bg-paper"
      )}
    >
      <FileText size={18} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate">{attachment.file_name}</p>
        {attachment.file_size && <p className="text-[10px] opacity-70">{formatFileSize(attachment.file_size)}</p>}
      </div>
    </a>
  );
}
