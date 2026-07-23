-- =========================================================
-- KERJAHUB — MIGRATION 0053: LENGKAPI TABEL REALTIME YANG TERLEWAT
-- Jalankan SETELAH 0001-0052.
--
-- Ditemukan saat mengecek laporan "pesan baru tidak muncul otomatis":
-- tabel `attachments` (lampiran gambar/file di chat) dan
-- `escrow_payments` (dipakai popup kunci pembayaran, migrasi 0045)
-- TERNYATA TIDAK PERNAH dimasukkan ke publication `supabase_realtime`,
-- padahal kode frontend di kedua tempat itu sudah lama berlangganan
-- postgres_changes untuk keduanya -- jadi event-nya selama ini memang
-- tidak pernah terkirim sama sekali (bukan cuma putus-sambung), selalu
-- mengandalkan fallback polling. Ditambal di sini.
-- =========================================================

do $$
begin
  alter publication supabase_realtime add table public.attachments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.escrow_payments;
exception when duplicate_object then null;
end $$;
