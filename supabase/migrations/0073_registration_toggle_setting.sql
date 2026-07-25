-- =========================================================
-- KERJAHUB — MIGRATION 0073: TOGGLE AKTIFKAN/NON-AKTIFKAN REGISTRASI USER
-- Jalankan SETELAH 0001-0072.
--
-- Menambah 1 baris baru di `platform_settings` (tabel key-value yang
-- sudah dipakai untuk pengaturan lain, lihat 0002_features.sql) supaya
-- admin bisa aktif/non-aktifkan form registrasi user baru dari
-- Dashboard Admin -> Pengaturan Website, tanpa perlu deploy ulang.
--
-- RLS tabel ini sudah benar dari awal (0002): semua orang boleh SELECT
-- (perlu, karena halaman /register dibaca publik/belum login), tapi
-- cuma admin yang boleh UPDATE. Jadi tidak perlu policy baru di sini.
-- =========================================================

insert into platform_settings (key, value, description) values
  ('registration_enabled', 'true', 'Izinkan pengguna baru mendaftar akun lewat /register. Kalau dimatikan, form registrasi diganti pesan "sedang off sementara".')
on conflict (key) do nothing;
