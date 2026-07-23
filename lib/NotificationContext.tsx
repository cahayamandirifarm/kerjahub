"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import { getActiveConversationId } from "@/lib/push";
import Link from "next/link";
import { X, Bell, CheckCircle2, Wallet, MessageCircle, ShieldCheck, Briefcase, HandCoins } from "lucide-react";

interface NotifRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: string;
  is_read: boolean;
  created_at: string;
}

interface ToastItem extends NotifRow {
  toastId: number;
}

interface NotifState {
  unreadCount: number;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotifState>({ unreadCount: 0, markAllRead: async () => {} });

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // audio not available, ignore silently
  }
}

const CATEGORY_ICON: Record<string, any> = {
  lamaran: Briefcase,
  pembayaran: Wallet,
  pekerjaan: CheckCircle2,
  chat: MessageCircle,
  kyc: ShieldCheck,
  nego: HandCoins
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const supabase = createClient();

  const loadUnread = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("is_read", false);
    setUnreadCount(count || 0);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    loadUnread();

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotifRow;
          // Kalau notifikasi chat ini untuk percakapan yang SEDANG dibuka
          // pengguna, jangan toast+bunyi lagi — pesan sudah muncul langsung
          // di bubble chat-nya lewat realtime, jadi bakal dobel.
          if (row.category === "chat" && row.link && row.link === `/chat/${getActiveConversationId() || ""}`) {
            setUnreadCount((c) => c + 1);
            return;
          }
          setUnreadCount((c) => c + 1);
          if (profile?.notif_sound_enabled !== false) playBeep();
          toastIdRef.current += 1;
          const toastId = toastIdRef.current;
          setToasts((t) => [...t, { ...row, toastId }]);
          setTimeout(() => {
            setToasts((t) => t.filter((x) => x.toastId !== toastId));
          }, 9000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sinkronkan badge angka merah di ikon app (seperti WhatsApp) setiap kali
  // unreadCount berubah — baik nambah (notifikasi baru masuk saat app
  // terbuka) maupun berkurang (user baca notifikasi). Ini pelengkap untuk
  // badge yang di-set dari service worker saat push masuk ketika app
  // tertutup — begitu app dibuka lagi, angka ini yang jadi sumber kebenaran.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if ("setAppBadge" in navigator) {
      if (unreadCount > 0) {
        (navigator as any).setAppBadge(unreadCount).catch(() => {});
      } else {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    }
  }, [unreadCount]);

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("profile_id", user.id).eq("is_read", false);
    setUnreadCount(0);
  }

  function dismiss(toastId: number) {
    setToasts((t) => t.filter((x) => x.toastId !== toastId));
  }

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllRead }}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none">
        {toasts.map((t) => {
          const Icon = CATEGORY_ICON[t.category] || Bell;
          return (
            <div
              key={t.toastId}
              className="pointer-events-auto card p-4 shadow-lg border-forest/30 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-forest-light flex items-center justify-center shrink-0 text-forest-dark">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-ink">{t.title}</p>
                  {t.body && <p className="text-xs text-ink/60 mt-0.5">{t.body}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-ink/40">
                      {new Date(t.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {t.link && (
                      <Link
                        href={t.link}
                        onClick={() => dismiss(t.toastId)}
                        className="text-xs font-semibold text-forest"
                      >
                        Lihat detail
                      </Link>
                    )}
                  </div>
                </div>
                <button onClick={() => dismiss(t.toastId)} className="text-ink/30 hover:text-ink/60 shrink-0">
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
