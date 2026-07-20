-- =========================================================
-- KERJAHUB — MIGRATION 0015: TAMBAH STATUS 'dibatalkan'
-- Jalankan SETELAH 0001–0014.
--
-- Menambahkan nilai 'dibatalkan' ke enum status yang belum
-- memilikinya, supaya admin bisa membatalkan transaksi yang
-- masih menunggu (bukan cuma terima/tolak), dan supaya proses
-- otomatis "auto-cancel 6 jam" punya status yang valid untuk
-- dipakai.
--
-- (digital_order_status sudah punya 'dibatalkan' sejak migration
-- 0004, jadi tidak perlu diubah di sini.)
--
-- CATATAN PENTING: file ini SENGAJA dipisah dari migration 0016
-- karena PostgreSQL tidak mengizinkan nilai enum baru dipakai
-- dalam transaksi yang sama saat ia ditambahkan. Jalankan file
-- ini dulu sampai selesai, baru lanjut ke 0016.
-- =========================================================

alter type tx_status add value if not exists 'dibatalkan';
alter type topup_status add value if not exists 'dibatalkan';
alter type escrow_status add value if not exists 'dibatalkan';
