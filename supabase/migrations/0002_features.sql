-- =========================================================
-- KERJAHUB — MIGRATION 0002: FITUR LANJUTAN
-- Jalankan SETELAH 0001_init.sql, di Supabase SQL Editor.
-- Mencakup: escrow pembayaran, KYC selfie-only, alur kerja
-- lengkap (mulai kerja -> upload bukti -> konfirmasi -> rating),
-- notifikasi real-time, audit log, dan lokasi/PostGIS (nearby).
-- =========================================================

create extension if not exists postgis;

-- ---------------------------------------------------------
-- 1) PLATFORM SETTINGS (dikelola admin, tanpa perlu redeploy)
-- ---------------------------------------------------------
create table if not exists platform_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into platform_settings (key, value, description) values
  ('platform_fee_percent', '10', 'Persentase komisi platform saat pekerjaan selesai'),
  ('withdrawal_fee_percent_worker', '5', 'Persentase biaya penarikan khusus pencari kerja'),
  ('withdrawal_admin_fee', '10000', 'Biaya admin flat per transaksi penarikan (Rp)'),
  ('default_radius_km', '20', 'Radius pencarian default (KM)'),
  ('nearby_jobs_enabled', 'true', 'Aktifkan fitur pekerjaan terdekat'),
  ('nearby_workers_enabled', 'true', 'Aktifkan fitur pekerja terdekat'),
  ('gps_request_enabled', 'true', 'Minta izin GPS saat login/buka aplikasi'),
  ('location_update_distance_m', '500', 'Jarak (meter) sebelum lokasi diperbarui otomatis'),
  ('map_unit', 'km', 'Satuan jarak ditampilkan: meter atau km'),
  ('site_banner_text', '', 'Teks banner/pengumuman di beranda (kosongkan untuk sembunyikan)')
on conflict (key) do nothing;

alter table platform_settings enable row level security;
create policy "Semua orang bisa baca pengaturan" on platform_settings for select using (true);
create policy "Hanya admin ubah pengaturan" on platform_settings for update using (public.is_admin());
create policy "Hanya admin tambah pengaturan" on platform_settings for insert with check (public.is_admin());

create function public.get_setting(p_key text) returns text as $$
  select value from platform_settings where key = p_key;
$$ language sql stable;

create function public.get_setting_numeric(p_key text) returns numeric as $$
  select value::numeric from platform_settings where key = p_key;
$$ language sql stable;

-- ---------------------------------------------------------
-- 2) PROFIL: KYC selfie-only, lokasi, rating, preferensi
-- ---------------------------------------------------------
alter table profiles
  add column if not exists kyc_selfie_only boolean not null default true,
  add column if not exists notif_sound_enabled boolean not null default true,
  add column if not exists is_online boolean not null default false,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geom geography(Point, 4326),
  add column if not exists last_location_update timestamptz,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists village text,
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists completed_jobs_count integer not null default 0;

-- KTP tidak lagi wajib; kolom lama dibiarkan ada (kompatibel) tapi tidak dipakai UI baru.

create index if not exists profiles_geom_idx on profiles using gist (geom);

create function public.sync_profile_geom()
returns trigger as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_profile_geom
  before insert or update of latitude, longitude on profiles
  for each row execute procedure public.sync_profile_geom();

-- Update lokasi pengguna (dipanggil dari browser via Geolocation API)
create or replace function public.update_my_location(
  p_lat double precision, p_lng double precision,
  p_province text default null, p_city text default null,
  p_district text default null, p_village text default null
) returns void as $$
begin
  update profiles set
    latitude = p_lat,
    longitude = p_lng,
    province = coalesce(p_province, province),
    city = coalesce(p_city, city),
    district = coalesce(p_district, district),
    village = coalesce(p_village, village),
    last_location_update = now()
  where id = auth.uid();
end;
$$ language plpgsql security definer;

grant execute on function public.update_my_location(double precision, double precision, text, text, text, text) to authenticated;

-- ---------------------------------------------------------
-- 3) JOBS: lokasi + tahapan alur kerja baru
-- ---------------------------------------------------------
alter table jobs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geom geography(Point, 4326),
  add column if not exists address text,
  add column if not exists radius_km numeric;

create index if not exists jobs_geom_idx on jobs using gist (geom);

create function public.sync_job_geom()
returns trigger as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_job_geom
  before insert or update of latitude, longitude on jobs
  for each row execute procedure public.sync_job_geom();

-- Tahapan job baru yang lebih rinci mengikuti alur escrow
alter table jobs alter column stage drop default;
alter type job_stage rename to job_stage_old;
create type job_stage as enum (
  'terbuka',
  'diterima',
  'menunggu_pembayaran',
  'menunggu_konfirmasi_admin',
  'dana_diamankan',
  'dikerjakan',
  'menunggu_konfirmasi_selesai',
  'revisi',
  'selesai',
  'dibatalkan'
);
alter table jobs alter column stage type job_stage using (
  case stage::text
    when 'terbuka' then 'terbuka'
    when 'dibayar' then 'dana_diamankan'
    when 'dikerjakan' then 'dikerjakan'
    when 'selesai' then 'selesai'
    when 'dibatalkan' then 'dibatalkan'
    else 'terbuka'
  end
)::job_stage;
alter table jobs alter column stage set default 'terbuka'::job_stage;
drop type job_stage_old;

-- ---------------------------------------------------------
-- 4) BANK ACCOUNTS PLATFORM (dikelola admin, tujuan transfer escrow)
-- ---------------------------------------------------------
create table bank_accounts (
  id uuid primary key default uuid_generate_v4(),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table bank_accounts enable row level security;
create policy "Semua orang login bisa lihat rekening aktif" on bank_accounts
  for select using (auth.role() = 'authenticated');
create policy "Hanya admin kelola rekening" on bank_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 5) ESCROW PAYMENTS (pembayaran pemberi kerja ke platform per job)
-- ---------------------------------------------------------
create type escrow_status as enum ('menunggu_pembayaran', 'menunggu_konfirmasi_admin', 'berhasil', 'ditolak');

create table escrow_payments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  employer_id uuid not null references profiles(id),
  worker_id uuid not null references profiles(id),
  base_amount numeric(14,2) not null,
  unique_code integer not null,
  total_amount numeric(14,2) not null,
  bank_account_id uuid references bank_accounts(id),
  status escrow_status not null default 'menunggu_pembayaran',
  proof_url text,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table escrow_payments enable row level security;
create policy "Terlibat bisa lihat escrow" on escrow_payments
  for select using (auth.uid() = employer_id or auth.uid() = worker_id or public.is_admin());
-- Catatan: perubahan status escrow HANYA lewat fungsi security definer
-- (submit_escrow_proof, admin_confirm_escrow) — sengaja tidak ada policy
-- UPDATE langsung untuk klien agar status tidak bisa dimanipulasi dari browser.

-- ---------------------------------------------------------
-- 6) FOTO HASIL PEKERJAAN
-- ---------------------------------------------------------
create table job_photos (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  url text not null,
  created_at timestamptz not null default now()
);
alter table job_photos enable row level security;
create policy "Terlibat bisa lihat foto pekerjaan" on job_photos
  for select using (
    auth.uid() in (select employer_id from jobs where jobs.id = job_photos.job_id)
    or auth.uid() in (select assigned_worker_id from jobs where jobs.id = job_photos.job_id)
    or public.is_admin()
  );
create policy "Worker upload foto pekerjaannya" on job_photos
  for insert with check (auth.uid() = uploaded_by);

-- ---------------------------------------------------------
-- 7) RATING & ULASAN
-- ---------------------------------------------------------
create table ratings (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade unique,
  employer_id uuid not null references profiles(id),
  worker_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now()
);
alter table ratings enable row level security;
create policy "Semua orang login bisa baca rating" on ratings
  for select using (auth.role() = 'authenticated');
create policy "Employer beri rating job miliknya" on ratings
  for insert with check (auth.uid() = employer_id);

-- ---------------------------------------------------------
-- 8) AUDIT LOG
-- ---------------------------------------------------------
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id),
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
alter table audit_log enable row level security;
create policy "Hanya admin baca audit log" on audit_log for select using (public.is_admin());
create policy "Sistem tulis audit log" on audit_log for insert with check (true);

create function public.write_audit(p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}'::jsonb)
returns void as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_meta);
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 9) NOTIFIKASI: tambah kategori + aktifkan realtime
-- ---------------------------------------------------------
alter table notifications add column if not exists category text not null default 'umum';

-- Wajib agar popup notifikasi real-time (Supabase Realtime) berfungsi.
-- Aman dijalankan berulang; diabaikan jika tabel sudah terdaftar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- =========================================================
-- ALUR KERJA BARU (menggantikan accept_applicant & complete_job lama)
-- =========================================================

-- 1. Employer menerima pelamar -> generate escrow menunggu pembayaran (BELUM potong saldo langsung)
-- PENTING: drop dulu karena tipe return berubah dari void (versi 0001) menjadi uuid.
drop function if exists public.accept_applicant(uuid);

create function public.accept_applicant(p_application_id uuid)
returns uuid as $$
declare
  v_job jobs%rowtype;
  v_app applications%rowtype;
  v_code integer;
  v_bank bank_accounts%rowtype;
  v_escrow_id uuid;
  v_fee numeric;
begin
  select * into v_app from applications where id = p_application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;

  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  select * into v_job from jobs where id = v_app.job_id for update;
  if v_job.stage <> 'terbuka' then raise exception 'Pekerjaan sudah tidak terbuka'; end if;

  select * into v_bank from bank_accounts where is_active = true order by created_at limit 1;

  -- generate kode unik 3 digit yang belum dipakai di escrow yang masih menunggu
  loop
    v_code := floor(random() * 900 + 100)::integer;
    exit when not exists (
      select 1 from escrow_payments
      where unique_code = v_code and status in ('menunggu_pembayaran','menunggu_konfirmasi_admin')
    );
  end loop;

  insert into escrow_payments (job_id, employer_id, worker_id, base_amount, unique_code, total_amount, bank_account_id, status)
  values (v_job.id, v_job.employer_id, v_app.worker_id, v_job.price, v_code, v_job.price + v_code, v_bank.id, 'menunggu_pembayaran')
  returning id into v_escrow_id;

  update jobs set stage = 'menunggu_pembayaran', assigned_worker_id = v_app.worker_id where id = v_job.id;
  update applications set status = 'diterima' where id = p_application_id;
  update applications set status = 'ditolak' where job_id = v_job.id and id <> p_application_id and status = 'menunggu';

  insert into conversations (job_id, employer_id, worker_id)
  values (v_job.id, v_job.employer_id, v_app.worker_id)
  on conflict (job_id, worker_id) do nothing;

  insert into notifications (profile_id, title, body, link, category)
  values (v_app.worker_id, 'Lamaran diterima!', 'Anda diterima untuk "' || v_job.title || '". Menunggu pembayaran dari pemberi kerja.', '/dashboard/worker', 'lamaran');
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.employer_id, 'Selesaikan pembayaran', 'Transfer Rp' || (v_job.price + v_code) || ' untuk mengamankan pekerjaan "' || v_job.title || '".', '/dashboard/employer/escrow/' || v_escrow_id, 'pembayaran');

  perform public.write_audit('accept_applicant', 'jobs', v_job.id, jsonb_build_object('application_id', p_application_id, 'escrow_id', v_escrow_id));

  return v_escrow_id;
end;
$$ language plpgsql security definer;

-- 2. Employer upload bukti transfer
create or replace function public.submit_escrow_proof(p_escrow_id uuid, p_proof_url text)
returns void as $$
declare
  v_escrow escrow_payments%rowtype;
begin
  select * into v_escrow from escrow_payments where id = p_escrow_id for update;
  if not found then raise exception 'Data pembayaran tidak ditemukan'; end if;
  if auth.uid() <> v_escrow.employer_id then raise exception 'Tidak berhak'; end if;

  update escrow_payments set proof_url = p_proof_url, status = 'menunggu_konfirmasi_admin' where id = p_escrow_id;
  update jobs set stage = 'menunggu_konfirmasi_admin' where id = v_escrow.job_id;

  insert into notifications (profile_id, title, body, link, category)
  select id, 'Bukti pembayaran escrow baru', 'Perlu verifikasi pembayaran job.', '/admin/deposits', 'pembayaran'
  from profiles where role = 'admin';
end;
$$ language plpgsql security definer;

-- 3. Admin konfirmasi pembayaran escrow
create or replace function public.admin_confirm_escrow(p_escrow_id uuid, p_approve boolean, p_admin_id uuid)
returns void as $$
declare
  v_escrow escrow_payments%rowtype;
begin
  select * into v_escrow from escrow_payments where id = p_escrow_id for update;
  if not found then raise exception 'Data tidak ditemukan'; end if;

  if p_approve then
    update escrow_payments set status = 'berhasil', reviewed_by = p_admin_id, confirmed_at = now() where id = p_escrow_id;
    update jobs set stage = 'dana_diamankan', paid_at = now() where id = v_escrow.job_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_escrow.worker_id, 'Dana diamankan platform', 'Pembayaran dikonfirmasi. Kamu bisa mulai bekerja sekarang.', '/dashboard/worker', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_escrow.employer_id, 'Pembayaran dikonfirmasi', 'Dana sudah diamankan platform (escrow).', '/dashboard/employer', 'pembayaran');
  else
    update escrow_payments set status = 'ditolak', reviewed_by = p_admin_id where id = p_escrow_id;
    update jobs set stage = 'menunggu_pembayaran' where id = v_escrow.job_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_escrow.employer_id, 'Bukti pembayaran ditolak', 'Silakan unggah ulang bukti transfer yang valid.', '/dashboard/employer', 'pembayaran');
  end if;

  perform public.write_audit('admin_confirm_escrow', 'escrow_payments', p_escrow_id, jsonb_build_object('approve', p_approve));
end;
$$ language plpgsql security definer;

-- 4. Worker mulai bekerja
create or replace function public.start_work(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.assigned_worker_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage <> 'dana_diamankan' then raise exception 'Pekerjaan belum siap dimulai'; end if;

  update jobs set stage = 'dikerjakan' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.employer_id, 'Pekerja mulai bekerja', 'Pekerja telah menekan tombol Mulai Bekerja untuk "' || v_job.title || '".', '/dashboard/employer', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- 5. Worker submit hasil pekerjaan (foto sudah diupload lewat storage sebelumnya, ini menandai selesai)
create or replace function public.submit_job_completion(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
  v_photo_count integer;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.assigned_worker_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage not in ('dikerjakan', 'revisi') then raise exception 'Status pekerjaan tidak sesuai'; end if;

  select count(*) into v_photo_count from job_photos where job_id = p_job_id;
  if v_photo_count < 1 then raise exception 'Unggah minimal 1 foto hasil pekerjaan'; end if;

  update jobs set stage = 'menunggu_konfirmasi_selesai' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.employer_id, 'Pekerjaan selesai dikerjakan', '"' || v_job.title || '" menunggu konfirmasi kamu.', '/dashboard/employer', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- 6. Employer minta revisi
create or replace function public.request_revision(p_job_id uuid, p_note text)
returns void as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update jobs set stage = 'revisi' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.assigned_worker_id, 'Revisi diminta', coalesce(p_note, 'Pemberi kerja meminta revisi pekerjaan.'), '/dashboard/worker', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- 7. Employer approve + kasih rating -> pencairan saldo worker
create or replace function public.approve_completion(p_job_id uuid, p_rating integer, p_review text)
returns void as $$
declare
  v_job jobs%rowtype;
  v_fee_percent numeric := coalesce(public.get_setting_numeric('platform_fee_percent'), 10);
  v_komisi numeric(14,2);
  v_upah_bersih numeric(14,2);
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage <> 'menunggu_konfirmasi_selesai' then raise exception 'Status tidak sesuai'; end if;

  v_komisi := round(v_job.price * v_fee_percent / 100, 2);
  v_upah_bersih := v_job.price - v_komisi;

  update profiles set
    wallet_balance = wallet_balance + v_upah_bersih,
    completed_jobs_count = completed_jobs_count + 1
  where id = v_job.assigned_worker_id;

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_upah_bersih, 'berhasil', 'Upah diterima (setelah komisi platform ' || v_fee_percent || '%) untuk: ' || v_job.title);
  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'komisi_platform', v_komisi, 'berhasil', 'Komisi platform untuk: ' || v_job.title);

  update jobs set stage = 'selesai', completed_at = now() where id = p_job_id;

  if p_rating is not null then
    insert into ratings (job_id, employer_id, worker_id, rating, review)
    values (p_job_id, v_job.employer_id, v_job.assigned_worker_id, p_rating, p_review)
    on conflict (job_id) do update set rating = excluded.rating, review = excluded.review;

    update profiles set
      rating_count = (select count(*) from ratings where worker_id = v_job.assigned_worker_id),
      rating_avg = (select round(avg(rating)::numeric, 2) from ratings where worker_id = v_job.assigned_worker_id)
    where id = v_job.assigned_worker_id;
  end if;

  insert into notifications (profile_id, title, body, link, category)
  values (v_job.assigned_worker_id, 'Pekerjaan disetujui!', 'Upah Rp' || v_upah_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/worker', 'pekerjaan');

  perform public.write_audit('approve_completion', 'jobs', p_job_id, jsonb_build_object('rating', p_rating));
end;
$$ language plpgsql security definer;

-- Hapus fungsi lama yang sudah digantikan alur baru
drop function if exists public.mark_job_in_progress(uuid);
drop function if exists public.complete_job(uuid);

-- =========================================================
-- PENCARIAN LOKASI (NEARBY) — privasi terjaga, tidak expose lat/lng mentah
-- =========================================================
create or replace function public.nearby_jobs(p_lat double precision, p_lng double precision, p_limit integer default 50)
returns table (
  id uuid, title text, category text, price numeric, estimated_duration text,
  district text, city text, distance_m double precision, created_at timestamptz
) as $$
  select j.id, j.title, j.category, j.price, j.estimated_duration,
         e.district, e.city,
         ST_Distance(j.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         j.created_at
  from jobs j
  join profiles e on e.id = j.employer_id
  where j.stage = 'terbuka'
    and j.geom is not null
    and ST_DWithin(
      j.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_jobs(double precision, double precision, integer) to authenticated, anon;

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
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      public.get_setting_numeric('default_radius_km') * 1000
    )
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_workers(double precision, double precision, integer) to authenticated;

-- ---------------------------------------------------------
-- Storage bucket tambahan: foto hasil pekerjaan
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', false)
  on conflict (id) do nothing;

create policy "Worker upload foto job miliknya" on storage.objects
  for insert with check (bucket_id = 'job-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Terlibat & admin lihat foto job" on storage.objects
  for select using (bucket_id = 'job-photos' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()));

-- ---------------------------------------------------------
-- Perketat RLS: akun ditangguhkan tidak bisa posting job atau melamar
-- ---------------------------------------------------------
drop policy if exists "Employer bisa insert job miliknya" on jobs;
create policy "Employer bisa insert job miliknya" on jobs
  for insert with check (
    auth.uid() = employer_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
  );

drop policy if exists "Worker bisa melamar" on applications;
create policy "Worker bisa melamar" on applications
  for insert with check (
    auth.uid() = worker_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
  );

-- ---------------------------------------------------------
-- Pembatasan akses tambahan: akun ditangguhkan tidak bisa
-- mengajukan penarikan saldo (memperbarui fungsi dari 0001).
-- ---------------------------------------------------------
create or replace function public.request_withdrawal(p_amount numeric)
returns uuid as $$
declare
  v_profile profiles%rowtype;
  v_biaya_tarik numeric(14,2) := 0;
  v_biaya_admin numeric(14,2) := coalesce(public.get_setting_numeric('withdrawal_admin_fee'), 10000);
  v_note text;
  v_tx_id uuid;
begin
  select * into v_profile from profiles where id = auth.uid() for update;
  if v_profile.is_suspended then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;
  if v_profile.bank_account_number is null then
    raise exception 'Lengkapi data rekening bank terlebih dahulu';
  end if;
  if v_profile.wallet_balance < p_amount then
    raise exception 'Saldo tidak mencukupi';
  end if;

  if v_profile.role = 'worker' then
    v_biaya_tarik := round(p_amount * coalesce(public.get_setting_numeric('withdrawal_fee_percent_worker'), 5) / 100, 2);
    v_note := 'Penarikan diajukan. Biaya admin Rp' || v_biaya_admin || ' + biaya penarikan (Rp' || v_biaya_tarik || ') akan dipotong saat disetujui admin.';
  else
    v_note := 'Penarikan diajukan. Biaya admin Rp' || v_biaya_admin || ' per transaksi akan dipotong saat disetujui admin.';
  end if;

  update profiles set wallet_balance = wallet_balance - p_amount where id = v_profile.id;

  insert into transactions (profile_id, type, amount, status, note, bank_name, bank_account_number)
  values (v_profile.id, 'penarikan', p_amount, 'menunggu', v_note, v_profile.bank_name, v_profile.bank_account_number)
  returning id into v_tx_id;

  perform public.write_audit('request_withdrawal', 'transactions', v_tx_id, jsonb_build_object('amount', p_amount));

  return v_tx_id;
end;
$$ language plpgsql security definer;
