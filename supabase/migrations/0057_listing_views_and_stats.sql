-- =========================================================
-- KERJAHUB — MIGRATION 0057: VIEW COUNT POSTINGAN & PRODUK
--
-- CATATAN NOMOR FILE: sesuaikan urutan angka file ini kalau di folder
-- migrations kamu nomor 0057 sudah dipakai file lain -- yang penting
-- dijalankan PALING TERAKHIR.
--
-- Fitur:
-- 1) Kolom `view_count` di `jobs` & `digital_listings` -- dipakai untuk
--    menandai "sering dilihat pengguna lain" di kartu beranda/marketplace.
-- 2) Fungsi security definer `increment_job_views` /
--    `increment_listing_views` supaya penambahan angka view aman dipanggil
--    dari halaman publik (anon) tanpa perlu policy UPDATE terbuka di tabel.
-- 3) Index bantu untuk query profil publik (semua postingan/listing milik
--    satu akun) yang dipakai halaman /profil/[id].
-- =========================================================

-- ---------------------------------------------------------
-- 1) VIEW COUNT
-- ---------------------------------------------------------
alter table jobs add column if not exists view_count integer not null default 0;
alter table digital_listings add column if not exists view_count integer not null default 0;

create index if not exists jobs_view_count_idx on jobs(view_count desc);
create index if not exists digital_listings_view_count_idx on digital_listings(view_count desc);

-- ---------------------------------------------------------
-- 2) RPC INCREMENT VIEW (dipanggil dari halaman detail)
-- ---------------------------------------------------------
create or replace function public.increment_job_views(p_job_id uuid)
returns void as $$
begin
  update jobs set view_count = view_count + 1 where id = p_job_id;
end;
$$ language plpgsql security definer;

grant execute on function public.increment_job_views(uuid) to anon, authenticated;

create or replace function public.increment_listing_views(p_listing_id uuid)
returns void as $$
begin
  update digital_listings set view_count = view_count + 1 where id = p_listing_id;
end;
$$ language plpgsql security definer;

grant execute on function public.increment_listing_views(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- 3) INDEX UNTUK HALAMAN PROFIL PUBLIK (/profil/[id])
-- ---------------------------------------------------------
create index if not exists jobs_employer_active_idx on jobs(employer_id, is_active, stage);
create index if not exists digital_listings_seller_status_idx on digital_listings(seller_id, status);
