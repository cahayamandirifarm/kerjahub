-- =========================================================
-- KERJAHUB — MIGRATION 0072: PERBAIKAN "RIWAYAT NOTIFIKASI TIDAK PERNAH MUNCUL"
-- Jalankan SETELAH 0001-0071.
--
-- BUG (sejak migration 0060): trigger `trg_zz_purge_notification` meng-
-- hapus baris `notifications` di AFTER INSERT trigger PADA TRANSAKSI YANG
-- SAMA dengan insert-nya. Migration 0060 berasumsi urutan trigger
-- (alfabetis: trg_notify_push_for_notification jalan sebelum
-- trg_zz_purge_notification) berarti Supabase Realtime akan "sempat"
-- menangkap event INSERT sebelum baris itu dihapus.
--
-- Asumsi itu SALAH. Urutan trigger cuma menentukan urutan eksekusi SQL,
-- bukan apa yang direplikasi. Supabase Realtime (`postgres_changes`)
-- memakai logical decoding Postgres, dan Postgres MENGGABUNGKAN/
-- MEMBATALKAN insert+delete terhadap baris yang sama kalau terjadi DALAM
-- SATU TRANSAKSI -- baris itu tidak pernah masuk WAL/replication stream
-- sama sekali, karena dari luar transaksi tsb baris itu memang "tidak
-- pernah ada". Akibatnya event INSERT yang ditunggu
-- lib/NotificationContext.tsx (untuk isi cache IndexedDB saat app
-- terbuka) TIDAK PERNAH terkirim -- bukan telat, tapi memang tidak
-- pernah. Satu-satunya jalur yang tersisa adalah Web Push asli ke
-- service worker, yang cuma jalan kalau device itu punya subscription
-- push yang valid & aktif. Kalau tidak (izin belum diberikan/
-- subscription hilang), riwayat notifikasi (selain chat) memang TIDAK
-- PERNAH terisi.
--
-- FIX: jangan hapus baris di transaksi yang sama dengan insert-nya lagi.
-- Baris tetap dibuat SANGAT sementara (bukan riwayat permanen di server,
-- sesuai tujuan awal 0060), tapi dihapus lewat job pg_cron terpisah
-- beberapa menit kemudian -- supaya insert-nya sempat commit sendiri
-- dulu dan direplikasi dengan benar ke client yang sedang online lewat
-- Realtime, sebelum baris itu dibersihkan permanen di transaksi lain.
-- =========================================================

-- 1. Matikan trigger lama yang menghapus baris di transaksi yang sama.
drop trigger if exists trg_zz_purge_notification on notifications;
drop function if exists public.purge_notification_after_dispatch();

-- 2. Job pembersihan terpisah: hapus baris `notifications` yang sudah
--    berumur lebih dari 5 menit. 5 menit jauh lebih dari cukup untuk
--    Realtime mereplikasi INSERT-nya ke semua client yang online, tapi
--    tetap membuat tabel ini sekadar "perantara sesaat" -- bukan
--    riwayat permanen di server (riwayat & badge tetap sepenuhnya di
--    cache lokal / IndexedDB tiap perangkat, lihat lib/notifCache.ts &
--    public/service-worker.js).
create or replace function public.purge_stale_notifications()
returns void as $$
begin
  delete from notifications where created_at < now() - interval '5 minutes';
end;
$$ language plpgsql security definer;

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'kerjahub-purge-stale-notifications';

select cron.schedule(
  'kerjahub-purge-stale-notifications',
  '*/2 * * * *', -- setiap 2 menit
  $$ select public.purge_stale_notifications(); $$
);
