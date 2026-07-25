-- =========================================================
-- KERJAHUB — MIGRATION 0065: FILTER KONTEN TERLARANG DI POSTINGAN & PRODUK
-- Jalankan SETELAH 0064.
--
-- Menyaring postingan job/jasa & produk marketplace yang terindikasi:
-- kencan/dating & layanan dewasa, penipuan/scam, dan modus
-- "curhat/teman/menemani" (sering dipakai sebagai kedok jasa kencan
-- berbayar di platform kerja/marketplace).
--
-- DESAIN:
-- 1) `moderation_keywords` -- daftar kata kunci, BISA DIKELOLA ADMIN
--    (tambah/nonaktifkan kata) tanpa perlu migration baru tiap kali ada
--    kata baru yang mau diblokir.
-- 2) `moderation_flags` -- log audit: postingan mana yang kena filter,
--    kata kunci mana yang cocok, kapan -- supaya admin bisa tinjau ulang
--    (jaga-jaga false positive) lewat panel admin nanti.
-- 3) Trigger BEFORE INSERT OR UPDATE di `jobs` & `digital_listings` --
--    postingan BARU (atau yang di-edit) yang judul/deskripsinya cocok
--    kata kunci akan DITOLAK saat submit (pesan error jelas ke user),
--    bukan diloloskan lalu disembunyikan diam-diam -- supaya user tahu
--    alasan langsung & tidak bingung postingannya "hilang".
-- 4) Sapuan retroaktif -- postingan yang SUDAH ADA sebelum migration ini
--    dan cocok kata kunci langsung dinonaktifkan (jobs.is_active=false,
--    digital_listings.status='nonaktif') + dicatat di moderation_flags.
--
-- CATATAN: ini filter kata kunci sederhana (substring match, case
-- insensitive), bukan AI moderation -- pasti ada kemungkinan false
-- positive/negative. Kata kunci sengaja dibuat bisa dikelola admin
-- (tabel biasa, bukan hardcode di function) supaya mudah disesuaikan
-- tanpa migration baru.
-- =========================================================

create table moderation_keywords (
  id uuid primary key default uuid_generate_v4(),
  keyword text not null,
  category text not null check (category in ('dating_dewasa', 'scam', 'curhat_teman')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index moderation_keywords_keyword_idx on moderation_keywords (lower(keyword));

create table moderation_flags (
  id uuid primary key default uuid_generate_v4(),
  source_type text not null check (source_type in ('job', 'listing')),
  job_id uuid references jobs(id) on delete cascade,
  listing_id uuid references digital_listings(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  matched_keyword text not null,
  matched_category text not null,
  title_snapshot text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create index moderation_flags_owner_idx on moderation_flags (owner_id);
create index moderation_flags_reviewed_idx on moderation_flags (reviewed);

alter table moderation_keywords enable row level security;
alter table moderation_flags enable row level security;

create policy "Admin kelola kata kunci moderasi" on moderation_keywords
  for all using (public.is_admin()) with check (public.is_admin());
create policy "Admin lihat log moderasi" on moderation_flags
  for select using (public.is_admin());

-- Seed kata kunci awal. is_active=true semua -- admin bisa nonaktifkan
-- lewat panel admin kalau ada yang kebanyakan false positive, atau
-- tambah kata baru kapan saja lewat insert biasa ke tabel ini.
insert into moderation_keywords (keyword, category) values
  ('open bo', 'dating_dewasa'),
  ('ojol bo', 'dating_dewasa'),
  ('booking online', 'dating_dewasa'),
  ('kencan berbayar', 'dating_dewasa'),
  ('jasa kencan', 'dating_dewasa'),
  ('short time', 'dating_dewasa'),
  ('sugar baby', 'dating_dewasa'),
  ('sugar daddy', 'dating_dewasa'),
  ('layanan dewasa', 'dating_dewasa'),
  ('konten dewasa', 'dating_dewasa'),
  ('pijat plus', 'dating_dewasa'),
  ('full service', 'dating_dewasa'),
  ('esek-esek', 'dating_dewasa'),
  ('transfer dulu baru', 'scam'),
  ('dp dulu', 'scam'),
  ('bayar di muka tanpa', 'scam'),
  ('jaminan 100% cair', 'scam'),
  ('kerja modal hp doang gaji', 'scam'),
  ('klik link dapat saldo', 'scam'),
  ('teman curhat', 'curhat_teman'),
  ('temenin curhat', 'curhat_teman'),
  ('jasa curhat', 'curhat_teman'),
  ('teman ngobrol malam', 'curhat_teman'),
  ('teman jalan berbayar', 'curhat_teman'),
  ('menemani pria', 'curhat_teman'),
  ('menemani wanita', 'curhat_teman'),
  ('temenin jalan', 'curhat_teman'),
  ('sewa teman', 'curhat_teman'),
  ('rent a friend', 'curhat_teman')
on conflict (lower(keyword)) do nothing;

create or replace function public.text_has_moderation_keyword(p_text text)
returns table (matched_keyword text, matched_category text) as $$
  select mk.keyword, mk.category
  from moderation_keywords mk
  where mk.is_active
    and lower(p_text) like '%' || lower(mk.keyword) || '%'
  limit 1;
$$ language sql stable security definer;

create or replace function public.check_job_moderation()
returns trigger as $$
declare
  v_hit record;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('job', new.id, new.employer_id, v_hit.matched_keyword, v_hit.matched_category, new.title);
    raise exception 'Postingan tidak bisa disimpan -- judul/deskripsi terindikasi mengandung konten yang dilarang platform (mis. kencan/layanan dewasa, penipuan, atau jasa "teman/curhat/menemani" berbayar). Silakan ubah judul/deskripsi lalu coba lagi.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_job_moderation on jobs;
create trigger trg_check_job_moderation
  before insert or update of title, description on jobs
  for each row execute function public.check_job_moderation();

create or replace function public.check_listing_moderation()
returns trigger as $$
declare
  v_hit record;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, listing_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('listing', new.id, new.seller_id, v_hit.matched_keyword, v_hit.matched_category, new.title);
    raise exception 'Produk tidak bisa disimpan -- judul/deskripsi terindikasi mengandung konten yang dilarang platform (mis. kencan/layanan dewasa, penipuan, atau jasa "teman/curhat/menemani" berbayar). Silakan ubah judul/deskripsi lalu coba lagi.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_listing_moderation on digital_listings;
create trigger trg_check_listing_moderation
  before insert or update of title, description on digital_listings
  for each row execute function public.check_listing_moderation();

-- ===== Sapuan retroaktif: sembunyikan postingan LAMA yang sudah cocok kata kunci =====
do $$
declare
  r record;
  v_hit record;
begin
  for r in select id, employer_id, title, description from jobs where is_active = true loop
    select * into v_hit from public.text_has_moderation_keyword(coalesce(r.title, '') || ' ' || coalesce(r.description, ''));
    if found then
      update jobs set is_active = false where id = r.id;
      insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
      values ('job', r.id, r.employer_id, v_hit.matched_keyword, v_hit.matched_category, r.title);
    end if;
  end loop;

  for r in select id, seller_id, title, description from digital_listings where status = 'aktif' loop
    select * into v_hit from public.text_has_moderation_keyword(coalesce(r.title, '') || ' ' || coalesce(r.description, ''));
    if found then
      update digital_listings set status = 'nonaktif' where id = r.id;
      insert into moderation_flags (source_type, listing_id, owner_id, matched_keyword, matched_category, title_snapshot)
      values ('listing', r.id, r.seller_id, v_hit.matched_keyword, v_hit.matched_category, r.title);
    end if;
  end loop;
end $$;
