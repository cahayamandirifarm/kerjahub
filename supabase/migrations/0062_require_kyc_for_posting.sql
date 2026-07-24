-- =========================================================
-- KERJAHUB — MIGRATION 0062: WAJIB KYC TERVERIFIKASI UNTUK POSTING
-- Jalankan SETELAH 0061.
--
-- Ini lapisan pertahanan UTAMA (RLS) -- validasi di form (JobForm,
-- ListingForm) di sisi client cuma untuk UX (pop up + auto-blokir form),
-- tapi tidak bisa diandalkan sendirian karena bisa dilewati lewat request
-- langsung ke Supabase. RLS di sini yang benar-benar menegakkan aturan:
--
-- 1) INSERT job (lowongan/tawaran jasa) & listing marketplace digital
--    HANYA boleh oleh user dengan profiles.kyc_status = 'terverifikasi'.
-- 2) SELECT (tampil publik) job & listing HANYA yang pemiliknya sudah
--    terverifikasi -- postingan lama milik user yang belum/tidak lagi
--    terverifikasi otomatis tersembunyi dari feed publik, tanpa perlu
--    dihapus. Pemilik postingan & admin tetap bisa melihat postingan
--    miliknya sendiri (mis. untuk dikelola di dashboard) walau belum
--    terverifikasi.
-- =========================================================

-- ---------------------------------------------------------
-- 1) JOBS -- perketat INSERT: wajib kyc_status = 'terverifikasi'
-- ---------------------------------------------------------
drop policy if exists "Employer bisa insert job miliknya" on jobs;
create policy "Employer bisa insert job miliknya" on jobs
  for insert with check (
    auth.uid() = employer_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
    and exists (select 1 from profiles where id = auth.uid() and kyc_status = 'terverifikasi')
  );

-- ---------------------------------------------------------
-- 2) JOBS -- perketat SELECT: sembunyikan postingan milik user
--    yang belum terverifikasi dari tampilan publik.
-- ---------------------------------------------------------
drop policy if exists "Job terbuka bisa dilihat publik" on jobs;
create policy "Job dari user terverifikasi bisa dilihat publik" on jobs
  for select using (
    auth.uid() = employer_id
    or public.is_admin()
    or exists (
      select 1 from profiles
      where profiles.id = jobs.employer_id and profiles.kyc_status = 'terverifikasi'
    )
  );

-- ---------------------------------------------------------
-- 3) DIGITAL_LISTINGS -- perketat INSERT: wajib kyc_status = 'terverifikasi'
-- ---------------------------------------------------------
drop policy if exists "Seller bisa insert listing miliknya" on digital_listings;
create policy "Seller bisa insert listing miliknya" on digital_listings
  for insert with check (
    auth.uid() = seller_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
    and exists (select 1 from profiles where id = auth.uid() and kyc_status = 'terverifikasi')
  );

-- ---------------------------------------------------------
-- 4) DIGITAL_LISTINGS -- perketat SELECT: sembunyikan produk milik
--    seller yang belum terverifikasi dari tampilan publik.
-- ---------------------------------------------------------
drop policy if exists "Listing aktif bisa dilihat publik" on digital_listings;
create policy "Listing dari seller terverifikasi bisa dilihat publik" on digital_listings
  for select using (
    auth.uid() = seller_id
    or public.is_admin()
    or exists (
      select 1 from profiles
      where profiles.id = digital_listings.seller_id and profiles.kyc_status = 'terverifikasi'
    )
  );

-- ---------------------------------------------------------
-- 5) nearby_jobs & nearby_workers berjalan sebagai SECURITY DEFINER
--    (lihat migration 0058) -- artinya keduanya MELEWATI RLS di atas
--    sama sekali. Tanpa filter tambahan di sini, lowongan/pekerja dari
--    akun yang belum terverifikasi tetap akan muncul di section
--    "Lowongan & Pekerja Terdekat". Redefinisi ulang persis signature
--    yang sama seperti 0058, ditambah syarat kyc_status = 'terverifikasi'.
-- ---------------------------------------------------------
create or replace function public.nearby_jobs(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null,
  p_search text default null
)
returns table (
  id uuid, title text, category text, price numeric, is_nego boolean, estimated_duration text,
  district text, city text, distance_m double precision, created_at timestamptz
) as $$
  select j.id, j.title, j.category, j.price, j.is_nego, j.estimated_duration,
         e.district, e.city,
         ST_Distance(
           coalesce(j.geom, e.geom),
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
         ) as distance_m,
         j.created_at
  from jobs j
  join profiles e on e.id = j.employer_id
  where j.stage = 'terbuka'
    and j.is_active = true
    and j.posted_by_role = 'employer'
    and e.kyc_status = 'terverifikasi'
    and (p_category is null or j.category = p_category)
    and (p_search is null or trim(p_search) = '' or j.title ilike '%' || trim(p_search) || '%')
    and coalesce(j.geom, e.geom) is not null
    and ST_DWithin(
      coalesce(j.geom, e.geom),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

create or replace function public.nearby_workers(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null,
  p_search text default null
)
returns table (
  id uuid, full_name text, skills text[], district text, city text,
  rating_avg numeric, rating_count integer, completed_jobs_count integer,
  is_online boolean, distance_m double precision,
  job_id uuid, job_title text, job_category text, job_price numeric, job_is_nego boolean, job_estimated_duration text
) as $$
  select p.id, p.full_name, p.skills, p.district, p.city,
         p.rating_avg, p.rating_count, p.completed_jobs_count, p.is_online,
         ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         listing.id as job_id, listing.title as job_title, listing.category as job_category,
         listing.price as job_price, listing.is_nego as job_is_nego, listing.estimated_duration as job_estimated_duration
  from profiles p
  join lateral (
    select j.id, j.title, j.category, j.price, j.is_nego, j.estimated_duration
    from jobs j
    where j.employer_id = p.id
      and j.posted_by_role = 'worker'
      and j.stage = 'terbuka'
      and j.is_active = true
      and (p_category is null or j.category = p_category)
    order by j.created_at desc
    limit 1
  ) listing on true
  where p.role = 'worker'
    and p.kyc_status = 'terverifikasi'
    and p.geom is not null
    and (
      p_search is null or trim(p_search) = ''
      or listing.title ilike '%' || trim(p_search) || '%'
      or p.full_name ilike '%' || trim(p_search) || '%'
      or exists (select 1 from unnest(coalesce(p.skills, '{}')) s where s ilike '%' || trim(p_search) || '%')
    )
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      public.get_setting_numeric('default_radius_km') * 1000
    )
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc
  limit p_limit;
$$ language sql stable security definer;
