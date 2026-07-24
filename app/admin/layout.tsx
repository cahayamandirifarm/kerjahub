import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ArrowDownToLine,
  Upload,
  Briefcase,
  Receipt,
  Landmark,
  Settings,
  Star,
  ShieldAlert,
  ShoppingBag,
  Image as ImageIcon,
  MessageCircle,
  AlertTriangle,
  Scale,
  Megaphone,
  MapPin
} from "lucide-react";
import AdminLogoutButton from "./AdminLogoutButton";

const NAV = [
  { href: "/admin", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/admin/users", label: "Pengguna", icon: Users },
  { href: "/admin/lokasi-pengguna", label: "Lokasi Pengguna", icon: MapPin },
  { href: "/admin/kyc", label: "Verifikasi Selfie KYC", icon: ShieldCheck },
  { href: "/admin/chats", label: "Monitoring Chat", icon: MessageCircle },
  { href: "/admin/disputes", label: "Sengketa Chat", icon: AlertTriangle },
  { href: "/admin/escrow", label: "Konfirmasi Escrow", icon: ArrowDownToLine },
  { href: "/admin/topup-requests", label: "Top Up Saldo", icon: Upload },
  { href: "/admin/payment-settings", label: "Pengaturan Pembayaran", icon: Landmark },
  { href: "/admin/bank-accounts", label: "Rekening Bank (Escrow)", icon: Landmark },
  { href: "/admin/deposits", label: "Top Up Dompet (Lama)", icon: Upload },
  { href: "/admin/withdrawals", label: "Penarikan Saldo", icon: ArrowDownToLine },
  { href: "/admin/jobs", label: "Postingan Kerja", icon: Briefcase },
  { href: "/admin/marketplace-listings", label: "Listing Marketplace Digital", icon: ShoppingBag },
  { href: "/admin/marketplace-orders", label: "Order Marketplace Digital", icon: ShoppingBag },
  { href: "/admin/banners", label: "Banner Beranda", icon: ImageIcon },
  { href: "/admin/broadcast", label: "Broadcast Notifikasi", icon: Megaphone },
  { href: "/admin/ratings", label: "Rating & Ulasan", icon: Star },
  { href: "/admin/transactions", label: "Monitoring Transaksi", icon: Receipt },
  { href: "/admin/laporan-keuangan", label: "Laporan Keuangan", icon: Scale },
  { href: "/admin/settings", label: "Pengaturan Website", icon: Settings },
  { href: "/admin/audit-log", label: "Audit Log", icon: ShieldAlert }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin-login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/admin-login");

  return (
    <div className="min-h-screen flex bg-paper">
      <aside className="w-60 shrink-0 bg-ink text-paper hidden md:flex flex-col">
        <div className="px-5 py-5 font-display text-lg font-semibold border-b border-paper/10">
          KerjaHub <span className="text-gold">Admin</span>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-paper/70 hover:text-paper hover:bg-white/5"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-paper/10">
          <AdminLogoutButton />
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-2 overflow-x-auto px-3 py-2 bg-ink text-paper text-xs">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="shrink-0 px-3 py-1.5 rounded-full bg-white/10">
              {label}
            </Link>
          ))}
        </div>
        <main className="p-5 md:p-8 max-w-6xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
