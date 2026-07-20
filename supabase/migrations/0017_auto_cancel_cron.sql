-- =========================================================
-- KERJAHUB — MIGRATION 0017: JADWALKAN AUTO-CANCEL DI BACKGROUND
-- Jalankan SETELAH 0016.
--
-- Migration 0016 sudah membuat fungsi auto_cancel_expired_transactions(),
-- dan itu dipanggil tiap kali halaman Monitoring Transaksi (admin) atau
-- Riwayat Transaksi (user) dibuka. File ini menambahkan jadwal pg_cron
-- supaya fungsi yang sama JUGA berjalan otomatis di background setiap
-- 15 menit, walau tidak ada satupun halaman itu yang sedang dibuka.
--
-- CARA AKTIFKAN pg_cron DI SUPABASE (kalau belum aktif):
-- Dashboard project -> Database -> Extensions -> cari "pg_cron" -> Enable.
-- Setelah itu baru jalankan migration ini.
--
-- Kalau extension pg_cron TIDAK/BELUM diaktifkan, migration ini akan
-- GAGAL dengan pesan "extension pg_cron is not available" atau serupa.
-- Itu tidak masalah untuk fitur intinya — fungsi auto-cancel tetap
-- jalan lewat pemanggilan dari halaman seperti biasa (migration 0016),
-- ini cuma lapisan tambahan supaya jalan tanpa perlu ada yang buka
-- halaman.
-- =========================================================

create extension if not exists pg_cron with schema extensions;

-- Hapus jadwal lama dengan nama yang sama kalau migration ini
-- dijalankan ulang, supaya tidak dobel.
select cron.unschedule(jobid)
from cron.job
where jobname = 'kerjahub-auto-cancel-transaksi';

select cron.schedule(
  'kerjahub-auto-cancel-transaksi',
  '*/15 * * * *', -- setiap 15 menit
  $$ select public.auto_cancel_expired_transactions(); $$
);
