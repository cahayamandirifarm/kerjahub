-- Bug: kartu "Lowongan & Pekerja Terdekat" (dan halaman "Cari Pekerja" /
-- kategori "Saya Butuh Pekerjaan" / "Pekerja Terdekat" di dashboard
-- employer) cuma menampilkan SATU postingan per akun worker, walau akun
-- itu punya lebih dari satu jasa/postingan aktif dengan nama & deskripsi
-- yang berbeda-beda.
--
-- Penyebab: fungsi nearby_workers() memakai
--   join lateral (... order by j.created_at desc limit 1) listing on true
-- yang cuma mengambil postingan (jobs) TERBARU milik tiap worker, lalu
-- mengembalikan SATU baris per profil worker -- bukan satu baris per
-- postingan. Jadi kalau worker "Hendra" punya 2 postingan aktif
-- ("Jasa Periklanan Meta Ads Profesional" dan postingan lain), yang
-- kedua tidak pernah ikut kekirim ke frontend sama sekali.
--
-- Perbaikan: hapus `limit 1` di lateral join supaya SEMUA postingan aktif
-- milik tiap worker ikut dikembalikan, masing-masing sebagai baris
-- terpisah (job_id/job_title/job_category/dll unik per baris). Frontend
-- (NearbyJobsSection, /kategori, /dashboard/employer/nearby-workers)
-- sudah render satu kartu per baris hasil RPC ini, jadi otomatis semua
-- postingan ikut tampil begitu function ini diganti.
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
    select j.id, j.title, j.category, j.price, j.is_nego, j.estimated_duration, j.created_at
    from jobs j
    where j.employer_id = p.id
      and j.posted_by_role = 'worker'
      and j.stage = 'terbuka'
      and j.is_active = true
      and (p_category is null or j.category = p_category)
    -- TIDAK ADA `limit 1` DI SINI -- semua postingan aktif milik worker
    -- ini diambil, masing-masing jadi baris hasil tersendiri.
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
  -- Urutkan per-worker (distance_m/rating/completed_jobs/is_online sama
  -- untuk semua postingan milik worker yang sama), lalu postingan
  -- terbaru duluan supaya jasa yang baru diposting worker itu muncul
  -- lebih dulu di antara postingan-postingannya sendiri.
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc, listing.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_workers(double precision, double precision, integer, text, text) to authenticated, anon;
