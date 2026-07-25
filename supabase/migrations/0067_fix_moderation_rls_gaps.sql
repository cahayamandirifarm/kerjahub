-- =========================================================
-- KERJAHUB — MIGRATION 0067: PERBAIKAN 2 CELAH RLS DI FITUR FILTER KATA
-- Jalankan SETELAH 0066.
--
-- BUG 1 -- "postingan yang kena filter masih tampil":
-- Policy SELECT jobs/digital_listings (migration 0064) cuma mengecek
-- kepemilikan/admin/status verifikasi pemilik -- TIDAK PERNAH mengecek
-- is_active (jobs) / status='aktif' (digital_listings) sama sekali.
-- Akibatnya: postingan yang dinonaktifkan filter kata (atau dinonaktifkan
-- manual apa pun) TETAP BISA DIBUKA lewat link langsung ke halaman detail
-- (/jobs/[id] atau /marketplace/[id]) walau sudah hilang dari daftar
-- beranda/marketplace (yang nyembunyikannya cuma lewat filter query
-- .eq("is_active", true) di lib/cached-queries.ts, bukan RLS). Sekarang
-- ditambahkan jadi bagian dari syarat RLS itu sendiri -- publik (bukan
-- pemilik/admin) hanya bisa lihat yang aktif, di MANA SAJA halamannya
-- dibuka. Pemilik & admin tetap selalu bisa lihat punya sendiri / semua
-- (perlu supaya pemilik tahu postingannya kena nonaktifkan & admin bisa
-- meninjau).
--
-- BUG 2 -- trigger filter kata gagal dgn error RLS utk user biasa:
-- migration 0065 lupa kasih policy INSERT ke moderation_flags. Tanpa
-- policy INSERT, trigger check_job_moderation()/check_listing_moderation()
-- gagal nyatat log (insert into moderation_flags) tiap kali user BIASA
-- (bukan superuser migration) memposting konten yang kena filter --
-- errornya jadi "new row violates row-level security policy" yang
-- membingungkan, bukan pesan penolakan yang ramah yang sudah kita buat.
-- =========================================================

drop policy if exists "Job dari user terverifikasi bisa dilihat publik" on jobs;
create policy "Job dari user terverifikasi bisa dilihat publik" on jobs
  for select using (
    auth.uid() = employer_id
    or public.is_admin()
    or (is_active = true and public.is_profile_verified(employer_id))
  );

drop policy if exists "Listing dari seller terverifikasi bisa dilihat publik" on digital_listings;
create policy "Listing dari seller terverifikasi bisa dilihat publik" on digital_listings
  for select using (
    auth.uid() = seller_id
    or public.is_admin()
    or (status = 'aktif' and public.is_profile_verified(seller_id))
  );

create policy "Sistem bisa catat log moderasi" on moderation_flags
  for insert with check (auth.uid() = owner_id or public.is_admin());
