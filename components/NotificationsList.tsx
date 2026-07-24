"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cacheGetAll, CachedNotif } from "@/lib/notifCache";

// Sejak migration 0057, riwayat notifikasi tidak lagi disimpan di database
// -- baris di tabel `notifications` dihapus permanen begitu terkirim.
// Halaman ini sekarang membaca riwayatnya dari cache lokal (IndexedDB) di
// perangkat ini saja, bukan query Supabase.
export default function NotificationsList() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<CachedNotif[] | null>(null);

  useEffect(() => {
    if (!user) return;
    cacheGetAll(user.id).then(setNotifications);
  }, [user?.id]);

  if (notifications === null) {
    return <div className="card p-8 text-center text-ink/40 text-sm">Memuat riwayat notifikasi...</div>;
  }

  if (notifications.length === 0) {
    return (
      <div className="card p-8 text-center text-ink/50 text-sm">
        <Bell className="mx-auto mb-2" /> Belum ada notifikasi di perangkat ini.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <Link
          key={n.id}
          href={n.link || "#"}
          className={`card p-4 block ${!n.is_read ? "border-turquoise/40 bg-turquoise-light/40" : ""}`}
        >
          <p className="font-semibold text-ink">{n.title}</p>
          {n.body && <p className="text-sm text-ink/60 mt-0.5">{n.body}</p>}
          <p className="text-xs text-ink/40 mt-1">{new Date(n.created_at).toLocaleString("id-ID")}</p>
        </Link>
      ))}
    </div>
  );
}
