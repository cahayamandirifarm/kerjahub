-- =========================================================
-- Lanjutan dari 0019: bukan cuma memastikan pekerja punya postingan
-- "Mencari Kerja" aktif, tapi sekarang detail postingan itu (judul,
-- kategori, harga, estimasi durasi, id) ikut dikembalikan supaya
-- kartu "Pekerja Terdekat" di beranda bisa link langsung ke halaman
-- postingannya (/jobs/[id]) -- pemberi kerja bisa langsung memesan,
-- bukan cuma melihat kartu profil pasif tanpa aksi.
--
-- Kalau satu pekerja punya lebih dari satu postingan mencari kerja
-- aktif, yang diambil adalah yang PALING BARU (created_at desc).
-- =========================================================

drop function if exists public.nearby_workers(double precision, double precision, integer);

create or replace function public.nearby_workers(p_lat double precision, p_lng double precision, p_limit integer default 50)
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

grant execute on function public.nearby_workers(double precision, double precision, integer) to authenticated, anon;
