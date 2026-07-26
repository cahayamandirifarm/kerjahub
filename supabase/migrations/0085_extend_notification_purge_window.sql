-- =========================================================
-- KERJAHUB — MIGRATION 0085: PERPANJANG JENDELA RIWAYAT NOTIFIKASI DI SERVER
-- Jalankan SETELAH 0001-0084.
--
-- LATAR BELAKANG BUG: broadcast dari admin panel (dan notifikasi lain)
-- kadang "sampai" ke pengguna (push/badge muncul) tapi TIDAK ikut
-- tersimpan di riwayat /notifications -- terutama di PWA mobile, sementara
-- di desktop (tab situs biasanya tetap terbuka) selalu tersimpan.
--
-- Baris `notifications` cuma "singgah" sebentar di server (migration 0072:
-- dihapus job pg_cron setiap 2 menit, untuk baris berumur > 5 menit) --
-- riwayat permanen sepenuhnya hidup di cache lokal (IndexedDB) tiap
-- perangkat, diisi lewat 2 jalur: (a) event Realtime saat tab situs
-- terbuka, (b) event "push" di service worker saat app di background/
-- tertutup. Sekarang lib/NotificationContext.tsx JUGA menambahkan jalur
-- ketiga: query "reconcile" ke tabel ini begitu app dibuka, untuk
-- menangkap baris yang masih sempat ada di server tapi belum ke-cache di
-- perangkat itu (mis. push gagal diproses SW karena OS mematikannya
-- lebih dulu, izin notifikasi belum diberikan, dll).
--
-- Jendela 5 menit tadinya cukup untuk jalur Realtime (tab terbuka), tapi
-- SERING TIDAK CUKUP untuk jalur reconcile ini -- pengguna PWA mobile
-- lazimnya baru benar-benar MEMBUKA app beberapa menit (kadang lebih)
-- setelah notifikasi push muncul di layar. Perpanjang jendela jadi 6 jam
-- (masih sekadar "perantara sesaat", BUKAN riwayat permanen -- tujuan
-- awal 0057/0072 tetap terjaga) supaya reconcile itu tetap kebagian
-- baris broadcast walau app baru dibuka lumayan lama setelah dikirim.
-- =========================================================

create or replace function public.purge_stale_notifications()
returns void as $$
begin
  delete from notifications where created_at < now() - interval '6 hours';
end;
$$ language plpgsql security definer;

select cron.unschedule(jobid)
from cron.job
where jobname = 'kerjahub-purge-stale-notifications';

select cron.schedule(
  'kerjahub-purge-stale-notifications',
  '*/15 * * * *', -- setiap 15 menit (jendela sekarang jauh lebih lebar, tidak perlu sesering sebelumnya)
  $$ select public.purge_stale_notifications(); $$
);
