"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutDashboard, ShoppingBag, MessageCircle, Bell, User } from "lucide-react";
import clsx from "clsx";
import { useChatUnread } from "@/lib/ChatUnreadContext";

const ITEMS = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/dashboard/employer", label: "Dasbor", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/notifications", label: "Notifikasi", icon: Bell },
  { href: "/kyc", label: "Akun", icon: User }
];

export default function BottomNav() {
  const pathname = usePathname();
  const { unreadChatCount } = useChatUnread();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-glass border-t border-line/70 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around px-0.5 py-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex flex-col items-center gap-0.5 py-2 px-1.5 rounded-2xl text-[10px] font-semibold transition-colors min-w-[48px]",
                active ? "text-turquoise-dark bg-turquoise-light/70" : "text-ink/45"
              )}
            >
              <span className="relative">
                <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                {href === "/chat" && unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-clay text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                    {unreadChatCount > 9 ? "9+" : unreadChatCount}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
