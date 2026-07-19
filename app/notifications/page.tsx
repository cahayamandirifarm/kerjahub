import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { Bell } from "lucide-react";

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-semibold mb-6">Notifikasi</h1>
        <div className="space-y-2">
          {(!notifications || notifications.length === 0) && (
            <div className="card p-8 text-center text-ink/50 text-sm">
              <Bell className="mx-auto mb-2" /> Belum ada notifikasi.
            </div>
          )}
          {notifications?.map((n) => (
            <Link
              key={n.id}
              href={n.link || "#"}
              className={`card p-4 block ${!n.is_read ? "border-forest/40 bg-forest-light/40" : ""}`}
            >
              <p className="font-semibold text-ink">{n.title}</p>
              {n.body && <p className="text-sm text-ink/60 mt-0.5">{n.body}</p>}
              <p className="text-xs text-ink/40 mt-1">{new Date(n.created_at).toLocaleString("id-ID")}</p>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
