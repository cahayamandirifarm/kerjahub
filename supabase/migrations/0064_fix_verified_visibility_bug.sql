-- =========================================================
-- KERJAHUB — MIGRATION 0064: PERBAIKAN BUG "POSTINGAN TIDAK TAMPIL"
-- Jalankan SETELAH 0063.
--
-- BUG YANG DIPERBAIKI: sejak migration 0062, SEMUA job & listing
-- marketplace hilang dari beranda/marketplace (bukan cuma punya user
-- yang belum verifikasi) -- termasuk milik user yang SUDAH
-- terverifikasi. Efek sampingnya juga bikin section "Penerima Upah --
-- Khusus Remote" di beranda selalu kosong (datanya diambil dari fungsi
-- yang sama).
--
-- AKAR MASALAH: policy SELECT di jobs/digital_listings (migration 0062)
-- mengecek verifikasi pemilik lewat sub-query "exists (select 1 from
-- profiles where ...)" langsung di dalam definisi policy. Sub-query ini
-- ikut tunduk RLS tabel `profiles` itu sendiri (select using auth.role()
-- = 'authenticated') -- jadi begitu diakses lewat client anonim (dipakai
-- khusus untuk halaman publik yang di-cache, lib/supabase/public.ts),
-- sub-query itu SELALU mengembalikan 0 baris (RLS profiles memblokir
-- role anon), bukan cuma untuk user yang belum verifikasi.
--
-- PERBAIKAN: pindahkan pengecekan kyc_status ke fungsi `security
-- definer` -- persis pola yang sudah dipakai `is_admin()` sejak awal
-- (migration 0001), yang berjalan dengan hak akses pemilik fungsi
-- (bypass RLS) sehingga hasilnya benar utk SEMUA role (anon maupun
-- authenticated), bukan cuma yang sedang login.
-- =========================================================

create or replace function public.is_profile_verified(p_profile_id uuid)
returns boolean as $$
  select exists (
    select 1 from profiles where id = p_profile_id and kyc_status = 'terverifikasi'
  );
$$ language sql stable security definer;

drop policy if exists "Job dari user terverifikasi bisa dilihat publik" on jobs;
create policy "Job dari user terverifikasi bisa dilihat publik" on jobs
  for select using (
    auth.uid() = employer_id
    or public.is_admin()
    or public.is_profile_verified(employer_id)
  );

drop policy if exists "Listing dari seller terverifikasi bisa dilihat publik" on digital_listings;
create policy "Listing dari seller terverifikasi bisa dilihat publik" on digital_listings
  for select using (
    auth.uid() = seller_id
    or public.is_admin()
    or public.is_profile_verified(seller_id)
  );
