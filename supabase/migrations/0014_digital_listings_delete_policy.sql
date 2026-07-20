-- Dasbor sekarang punya tombol "Hapus" permanen untuk produk marketplace
-- digital milik user. Sebelumnya tabel digital_listings cuma punya policy
-- SELECT/INSERT/UPDATE -- tidak ada policy DELETE sama sekali, jadi RLS
-- otomatis menolak semua percobaan hapus (default deny). Tambahkan policy
-- DELETE untuk seller pemilik listing atau admin.
--
-- Catatan: digital_orders.listing_id mereferensikan digital_listings(id)
-- TANPA on delete cascade/set null, jadi kalau sebuah listing pernah punya
-- transaksi (digital_orders), percobaan DELETE akan gagal karena foreign
-- key constraint -- ini disengaja untuk menjaga histori transaksi/audit.
-- UI di aplikasi menangkap error ini dan menyarankan "Nonaktifkan" sebagai
-- gantinya untuk listing yang sudah pernah bertransaksi.
create policy "Seller & admin bisa hapus listing miliknya" on digital_listings
  for delete using (auth.uid() = seller_id or public.is_admin());
