-- =========================================================
-- KERJAHUB — MIGRATION 0039: FIX "LOWONGAN SEKITAR" TIDAK TAMPIL
--
-- BUG: Di beranda, section "Lowongan & Pekerja Terdekat" cuma
-- menampilkan kartu "Pekerja" (nearby_workers), kartu "Lowongan"
-- (nearby_jobs) nyaris tidak pernah muncul walau ada postingan
-- terbuka dalam radius.
--
-- AKAR MASALAH: nearby_jobs mensyaratkan `j.geom is not null` --
-- yaitu titik lokasi milik BARIS JOB itu sendiri. Titik ini cuma
-- terisi kalau user menekan tombol opsional "Gunakan lokasi GPS
-- saya saat ini" di JobForm (field yang wajib diisi cuma teks
-- lokasi, bukan GPS-nya), jadi mayoritas job tersimpan tanpa geom.
--
-- Sebaliknya nearby_workers mengambil titik dari `profiles.geom`,
-- yang otomatis terisi lewat popup "Aktifkan Lokasi" (LocationPrompt)
-- di hampir setiap sesi login -- makanya pekerja nyaris selalu
-- kedeteksi, sedangkan lowongan hampir tidak pernah.
--
-- FIX: nearby_jobs sekarang fallback ke lokasi profil pemasang
-- (profiles.geom milik employer_id) kalau job itu sendiri tidak
-- punya geom -- sama seperti radius yang sudah fallback ke
-- default_radius_km. Titik & filter ST_DWithin dihitung dari
-- COALESCE(j.geom, e.geom).
--
-- SEKALIAN DIRAPIKAN: nearby_jobs sekarang cuma mengambil postingan
-- dengan posted_by_role = 'employer' (lowongan beneran, butuh
-- pekerja). Sebelumnya tidak difilter sama sekali -- kalau job milik
-- posted_by_role = 'worker' (postingan "mencari kerja" / jasa)
-- kebetulan punya geom, dia bisa nongol dobel: sekali sebagai kartu
-- "Lowongan" di sini, sekali lagi sebagai kartu "Pekerja" lewat
-- nearby_workers (0020). Fallback geom di atas bikin duplikasi ini
-- jauh lebih sering kejadian kalau tidak difilter dari sekarang.
-- =========================================================

create or replace function public.nearby_jobs(p_lat double precision, p_lng double precision, p_limit integer default 50)
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
    and coalesce(j.geom, e.geom) is not null
    and ST_DWithin(
      coalesce(j.geom, e.geom),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_jobs(double precision, double precision, integer) to authenticated, anon;
