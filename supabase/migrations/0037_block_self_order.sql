-- =========================================================
-- KERJAHUB — MIGRATION 0037: BLOKIR AKSI KE POSTINGAN/PRODUK SENDIRI
-- Jalankan SETELAH 0029.
--
-- BUG: tidak ada pengecekan sama sekali (baik di RLS maupun di
-- ApplyButton) yang mencegah seseorang melamar/mengajak kerja sama ke
-- postingan job miliknya sendiri. (Pembelian produk digital sendiri
-- SUDAH diblokir sejak awal lewat fungsi create_digital_order, tapi
-- pesan error-nya cuma tampil sebagai alert() browser polos.)
--
-- FIX:
-- 1) Perketat RLS insert applications: tambahkan pengecekan job_id
--    yang dilamar bukan milik sendiri (defense-in-depth, selain
--    pengecekan di client/ApplyButton).
-- 2) Frontend (lihat file terpisah) sekarang menampilkan popup
--    "Tidak dapat melakukan aksi ini karena postingan/produk ini
--    adalah milik Anda sendiri." baik untuk melamar/mengajak kerja
--    sama (ApplyButton) maupun beli produk digital (BuyButton).
-- =========================================================

drop policy if exists "Worker bisa melamar" on applications;
create policy "Worker bisa melamar" on applications
  for insert with check (
    auth.uid() = worker_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
    and not exists (select 1 from jobs where id = job_id and employer_id = auth.uid())
  );
