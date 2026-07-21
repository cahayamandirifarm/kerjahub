-- =========================================================
-- KERJAHUB — MIGRATION 0033: ENUM UNTUK KOMISI REFERRAL (MLM)
-- Jalankan SETELAH 0032, SEBELUM 0034.
--
-- Menambahkan nilai 'komisi_referral' ke enum tx_type, dipakai oleh
-- baris transaksi komisi upline di migration 0034.
--
-- CATATAN PENTING (sama seperti migration 0015): file ini SENGAJA
-- dipisah dari 0034 karena PostgreSQL tidak mengizinkan nilai enum
-- baru dipakai dalam transaksi yang sama saat ia ditambahkan.
-- Jalankan file ini dulu sampai selesai, baru lanjut ke 0034.
-- =========================================================

alter type tx_type add value if not exists 'komisi_referral';
