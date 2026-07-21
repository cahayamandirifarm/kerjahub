"use client";
import { useEffect } from "react";
import { useNotifications } from "@/lib/NotificationContext";

// Dipasang di halaman /notifications. Begitu halaman ini dibuka (dilihat
// pengguna), tandai semua notifikasi sebagai sudah dibaca lewat
// NotificationContext, supaya badge merah di ikon lonceng (Navbar/BottomNav)
// otomatis hilang/berkurang jadi 0 — sebelumnya markAllRead() ada tapi tidak
// pernah dipanggil dari mana pun, jadi badge tidak pernah berkurang.
export default function MarkNotificationsRead() {
  const { markAllRead } = useNotifications();

  useEffect(() => {
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
