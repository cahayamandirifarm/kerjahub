-- Beranda menampilkan "Lowongan & Pekerja Terdekat" gabungan (tanpa sub-menu)
-- untuk SEMUA pengunjung, termasuk yang belum login. Sebelumnya fungsi
-- nearby_workers cuma di-grant ke role `authenticated`, jadi pengunjung
-- anonim tidak bisa melihat daftar pekerja terdekat di beranda.
grant execute on function public.nearby_workers(double precision, double precision, integer) to anon;
