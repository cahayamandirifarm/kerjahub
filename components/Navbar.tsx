"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useNotifications } from "@/lib/NotificationContext";
import { useChatUnread } from "@/lib/ChatUnreadContext";
import { useActiveJobLock } from "@/lib/ActiveJobLockContext";
import { createClient } from "@/lib/supabase/client";
import { Bell, LogOut, MessageCircle } from "lucide-react";

const NAV_LINKS = [
  { label: "Beranda", href: "/" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Cari Pekerja", href: "/?tipe=jasa" },
  { label: "Lowongan", href: "/?tipe=kerja" },
  { label: "Digital Asset", href: "/marketplace" }
];

export default function Navbar() {
  const { user, profile, loading } = useAuth();
  const { unreadCount } = useNotifications();
  const { unreadChatCount } = useChatUnread();
  const { activeJob } = useActiveJobLock();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-glass border-b border-line/70">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-brand shadow-soft flex items-center justify-center overflow-hidden">
              <img src="/icons/icon-192.png" alt="" className="w-full h-full object-cover" />
            </span>
            <span className="font-display text-xl font-bold text-ink tracking-tight">
              Kerja<span className="text-turquoise-dark">Hub</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) =>
              activeJob ? (
                <span
                  key={link.label}
                  aria-disabled="true"
                  className="px-3.5 py-2 rounded-full text-sm font-semibold text-ink/25 cursor-not-allowed select-none"
                >
                  {link.label}
                </span>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="px-3.5 py-2 rounded-full text-sm font-semibold text-ink/60 hover:text-turquoise-dark hover:bg-turquoise-light/60 transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user && (
            <Link
              href="/chat"
              className="relative p-2.5 rounded-full text-ink/60 hover:text-turquoise-dark hover:bg-turquoise-light/60 transition-colors"
            >
              <MessageCircle size={19} />
              {unreadChatCount > 0 && (
                <span className="absolute top-1 right-1 bg-clay text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadChatCount > 9 ? "9+" : unreadChatCount}
                </span>
              )}
            </Link>
          )}
          {!loading && user && !activeJob && (
            <Link
              href="/notifications"
              className="relative p-2.5 rounded-full text-ink/60 hover:text-turquoise-dark hover:bg-turquoise-light/60 transition-colors"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-clay text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          {!loading && user ? (
            <>
              <Link
                href="/dashboard/employer"
                className={
                  activeJob
                    ? "hidden md:flex items-center gap-2 rounded-full pl-1 pr-3.5 py-1 border border-line bg-white opacity-40 pointer-events-none"
                    : "hidden md:flex items-center gap-2 rounded-full pl-1 pr-3.5 py-1 border border-line bg-white hover:border-turquoise transition-colors"
                }
              >
                <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center text-xs font-display font-bold text-white overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    profile?.full_name?.[0]?.toUpperCase() ?? "?"
                  )}
                </div>
                <span className="text-sm font-semibold text-ink truncate max-w-[100px]">
                  {profile?.full_name || profile?.username}
                </span>
              </Link>
              <button onClick={handleLogout} className="btn-secondary !px-4 !py-2 text-sm gap-1.5">
                <LogOut size={15} /> <span className="hidden sm:inline">Keluar</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary !px-4 !py-2 text-sm hidden sm:inline-flex">
                Masuk
              </Link>
              <Link href="/register" className="btn-primary !px-4 !py-2 text-sm">
                Daftar
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
