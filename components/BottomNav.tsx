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
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-line md:hidden">
      <div className="flex items-stretch justify-around">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-1 py-2.5 px-3 text-xs font-medium",
                active ? "text-forest" : "text-ink/50"
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
