-- =========================================================
-- KERJAHUB — MIGRATION 0047: JELAJAHI KATEGORI DI BERANDA
--
-- Menambahkan filter kategori opsional (p_category) ke
-- nearby_jobs & nearby_workers, dipakai oleh halaman baru
-- /kategori (klik kartu kategori di beranda pada bagian
-- "Saya Butuh Pekerja" / "Saya Butuh Pekerjaan") untuk
-- menampilkan hanya postingan sekategori yang masih ada
-- dalam radius pencarian user yang sedang melihat. Kalau
-- kosong, halaman itu menampilkan popup "belum tersedia di
-- lokasi sekitar Anda".
--
-- Signature lama (double precision, double precision, integer)
-- di-drop dulu supaya tidak ambigu dengan overload baru yang
-- menambah parameter di akhir (p_category, default null jadi
-- pemanggilan lama seperti di NearbyJobsSection tetap jalan).
-- =========================================================

drop function if exists public.nearby_jobs(double precision, double precision, integer);
drop function if exists public.nearby_workers(double precision, double precision, integer);

create or replace function public.nearby_jobs(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null
)
returns table (
  id uuid, title text, category text, price numeric, estimated_duration text,
  district text, city text, distance_m double precision, created_at timestamptz
) as $$
  select j.id, j.title, j.category, j.price, j.estimated_duration,
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
    and (p_category is null or j.category = p_category)
    and coalesce(j.geom, e.geom) is not null
    and ST_DWithin(
      coalesce(j.geom, e.geom),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_jobs(double precision, double precision, integer, text) to authenticated, anon;

create or replace function public.nearby_workers(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null
)
returns table (
  id uuid, full_name text, skills text[], district text, city text,
  rating_avg numeric, rating_count integer, completed_jobs_count integer,
  is_online boolean, distance_m double precision,
  job_id uuid, job_title text, job_category text, job_price numeric, job_estimated_duration text
) as $$
  select p.id, p.full_name, p.skills, p.district, p.city,
         p.rating_avg, p.rating_count, p.completed_jobs_count, p.is_online,
         ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         listing.id as job_id, listing.title as job_title, listing.category as job_category,
         listing.price as job_price, listing.estimated_duration as job_estimated_duration
  from profiles p
  join lateral (
    select j.id, j.title, j.category, j.price, j.estimated_duration
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
    and p.geom is not null
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      public.get_setting_numeric('default_radius_km') * 1000
    )
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_workers(double precision, double precision, integer, text) to authenticated, anon;
