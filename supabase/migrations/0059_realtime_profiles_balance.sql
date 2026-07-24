-- =========================================================
-- KERJAHUB — MIGRATION 0059: REALTIME SALDO (TANPA POLLING)
-- Jalankan SETELAH 0001-0058.
--
-- Supaya tampilan saldo (wallet_balance) di dasbor bisa update sendiri
-- SAAT ADA TRANSAKSI (top up/withdraw/escrow/dsb) tanpa refresh halaman dan
-- TANPA polling berkala ke database, tabel `profiles` perlu ikut masuk
-- publication `supabase_realtime` supaya event UPDATE-nya bisa didengar
-- lewat Supabase Realtime (dipakai oleh components/LiveWalletBalance.tsx).
-- =========================================================

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
