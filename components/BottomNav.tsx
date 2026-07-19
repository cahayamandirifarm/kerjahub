"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutDashboard, ShoppingBag, Bell, User } from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/dashboard/employer", label: "Dasbor", icon: LayoutDashboard },
  { href: "/notifications", label: "Notifikasi", icon: Bell },
  { href: "/kyc", label: "Akun", icon: User }
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-glass border-t border-line/70 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around px-1 py-1.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-1 py-2 px-3 rounded-2xl text-[11px] font-semibold transition-colors min-w-[60px]",
                active ? "text-turquoise-dark bg-turquoise-light/70" : "text-ink/45"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
