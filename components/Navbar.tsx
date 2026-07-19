"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useNotifications } from "@/lib/NotificationContext";
import { createClient } from "@/lib/supabase/client";
import { Bell, LogOut } from "lucide-react";

export default function Navbar() {
  const { user, profile, loading } = useAuth();
  const { unreadCount } = useNotifications();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-display text-2xl font-semibold text-forest-dark">
            Kerja<span className="text-gold-dark">Hub</span>
          </Link>
          <Link href="/marketplace" className="hidden sm:block text-sm font-semibold text-ink/60 hover:text-forest">
            Marketplace Digital
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user && (
            <Link href="/notifications" className="relative p-2 text-ink/60 hover:text-forest">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-clay text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          {!loading && user ? (
            <>
              <Link
                href="/dashboard/employer"
                className="hidden md:flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border border-line bg-white hover:border-forest"
              >
                <div className="w-7 h-7 rounded-full bg-forest-light flex items-center justify-center text-xs font-display font-semibold text-forest-dark overflow-hidden">
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
              <button
                onClick={handleLogout}
                className="btn-secondary !px-4 !py-2 text-sm gap-1.5"
              >
                <LogOut size={15} /> <span className="hidden sm:inline">Keluar</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary !px-4 !py-2 text-sm">
              Masuk
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
