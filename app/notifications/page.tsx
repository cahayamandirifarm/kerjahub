import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import MarkNotificationsRead from "@/components/MarkNotificationsRead";
import NotificationsList from "@/components/NotificationsList";

// Sejak migration 0057, notifikasi tidak lagi disimpan permanen di
// database -- riwayatnya cuma ada di cache lokal (IndexedDB) tiap
// perangkat, jadi halaman ini tidak lagi query tabel `notifications` di
// server. Cek login tetap dilakukan di server seperti sebelumnya.
export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  return (
    <div className="min-h-screen pb-24">
      <MarkNotificationsRead />
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-semibold mb-6">Notifikasi</h1>
        <NotificationsList />
      </div>
      <BottomNav />
    </div>
  );
}
