-- =========================================================
-- Fitur "Pekerja Terdekat" sebelumnya menampilkan SEMUA profil dengan
-- role 'worker' yang sudah share lokasi (geom), walau pekerja tersebut
-- belum pernah memasang postingan "Mencari Kerja".
--
-- Sekarang hanya pekerja yang punya postingan "Mencari Kerja" AKTIF
-- (jobs.posted_by_role = 'worker', stage = 'terbuka', is_active = true)
-- yang akan muncul di daftar pekerja terdekat.
-- =========================================================

create or replace function public.nearby_workers(p_lat double precision, p_lng double precision, p_limit integer default 50)
returns table (
  id uuid, full_name text, skills text[], district text, city text,
  rating_avg numeric, rating_count integer, completed_jobs_count integer,
  is_online boolean, distance_m double precision
) as $$
  select p.id, p.full_name, p.skills, p.district, p.city,
         p.rating_avg, p.rating_count, p.completed_jobs_count, p.is_online,
         ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m
  from profiles p
  where p.role = 'worker'
    and p.geom is not null
    and exists (
      select 1
      from jobs j
      where j.employer_id = p.id
        and j.posted_by_role = 'worker'
        and j.stage = 'terbuka'
        and j.is_active = true
    )
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      public.get_setting_numeric('default_radius_km') * 1000
    )
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_workers(double precision, double precision, integer) to authenticated, anon;
