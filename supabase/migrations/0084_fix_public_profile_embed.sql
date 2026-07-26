-- =========================================================
-- KERJAHUB — MIGRATION 0084: PERBAIKAN FOTO PROFIL TIDAK TAMPIL DI
-- BERANDA & MARKETPLACE (section "Saya Butuh Pekerjaan -- Khusus Remote"
-- dan grid /marketplace)
--
-- Jalankan SETELAH migration terakhir yang sudah ada di project ini
-- (0083_nearby_workers_add_avatar.sql).
--
-- AKAR MASALAH: getHomeJobs/getMarketplaceListings (lib/cached-queries.ts)
-- selalu pakai client PUBLIK/ANONIM (createPublicClient, demi caching --
-- lihat catatan bugfix 0064). RLS di tabel jobs/digital_listings sendiri
-- SUDAH benar (bisa dibaca publik asal pemiliknya terverifikasi & aktif --
-- lihat 0064/0067). TAPI relasi `profiles!...(...)` yang di-EMBED di
-- select itu adalah query TERPISAH ke tabel profiles, dan tabel profiles
-- itu sendiri RLS-nya "select using (auth.role() = 'authenticated' or
-- is_admin())" -- SELALU memblokir role anon, apapun isi policy di
-- jobs/digital_listings. Makanya baris job/listingnya tetap muncul
-- (RLS jobs/digital_listings sudah oke), tapi field `job.profiles`
-- SELALU null utk akses publik -- makanya foto profil & badge
-- "Rating Tinggi" tidak pernah tampil di beranda/marketplace, walau
-- muncul normal di section "Terdekat" (itu lewat RPC nearby_jobs/
-- nearby_workers yang security definer, makanya kebal masalah ini).
--
-- PERBAIKAN: bikin RPC security definer serupa utk beranda & marketplace,
-- supaya join ke profiles tidak lagi lewat PostgREST embed (yang tunduk
-- RLS tabel profiles), tapi dilakukan di dalam function yang bypass RLS
-- -- persis pola nearby_jobs/nearby_workers. Function mengembalikan JSON
-- per baris supaya BENTUK datanya identik dengan select lama (field job
-- apa adanya + field "profiles" bersarang) -- TIDAK PERLU ubah komponen
-- React manapun (JobCard.tsx, dll), cukup ganti cara ambil data di
-- lib/cached-queries.ts.
--
-- PENTING: karena function ini security definer (bypass RLS jobs juga),
-- syarat "is_active" & "pemilik terverifikasi" HARUS ditulis ulang manual
-- di WHERE clause-nya (RLS jobs/digital_listings tidak otomatis berlaku
-- di dalam function ini) -- persis seperti nearby_jobs/nearby_workers.
-- =========================================================

create or replace function public.get_home_jobs(p_tipe text, p_limit integer default 150)
returns setof jsonb as $$
  select (to_jsonb(j) - 'geom') || jsonb_build_object(
    'profiles', case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'rating_avg', p.rating_avg,
      'rating_count', p.rating_count,
      'completed_jobs_count', p.completed_jobs_count
    ) end
  )
  from jobs j
  join profiles p on p.id = j.employer_id
  where j.stage = 'terbuka'
    and j.is_active = true
    and j.posted_by_role = p_tipe::user_role
    and p.kyc_status = 'terverifikasi'
  order by j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.get_home_jobs(text, integer) to authenticated, anon;

create or replace function public.get_marketplace_listings(p_search text default null, p_limit integer default 150)
returns setof jsonb as $$
  select (to_jsonb(l) - 'geom') || jsonb_build_object(
    'profiles', case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'rating_avg', p.rating_avg,
      'rating_count', p.rating_count,
      'completed_jobs_count', p.completed_jobs_count
    ) end
  )
  from digital_listings l
  join profiles p on p.id = l.seller_id
  where l.status = 'aktif'
    and p.kyc_status = 'terverifikasi'
    and (p_search is null or trim(p_search) = '' or l.title ilike '%' || trim(p_search) || '%')
  order by l.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.get_marketplace_listings(text, integer) to authenticated, anon;
