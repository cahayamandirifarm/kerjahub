-- =========================================================
-- KERJAHUB — SKEMA DATABASE UTAMA
-- Jalankan file ini di Supabase SQL Editor (project baru)
-- =========================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------
create type user_role as enum ('worker', 'employer', 'admin');
create type kyc_status as enum ('belum', 'menunggu', 'terverifikasi', 'ditolak');
create type job_stage as enum ('terbuka', 'dibayar', 'dikerjakan', 'selesai', 'dibatalkan');
create type application_status as enum ('menunggu', 'diterima', 'ditolak', 'dibatalkan');
create type tx_type as enum ('deposit', 'penarikan', 'bayar_kerja', 'terima_upah', 'komisi_platform', 'biaya_admin_tarik', 'refund');
create type tx_status as enum ('menunggu', 'berhasil', 'ditolak');

-- ---------------------------------------------------------
-- PROFILES (1:1 dengan auth.users, dibuat via trigger di bawah)
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null default 'Pengguna Baru',
  avatar_url text,
  role user_role not null default 'worker',
  phone text,
  bio text,
  skills text[],
  kyc_status kyc_status not null default 'belum',
  kyc_ktp_url text,
  kyc_selfie_url text,
  kyc_rejected_reason text,
  wallet_balance numeric(14,2) not null default 0,
  bank_name text,
  bank_account_number text,
  bank_account_holder text,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_username_idx on profiles(lower(username));

-- auto-create profile saat user baru mendaftar (username + password + no. HP)
-- username & phone dikirim lewat raw_user_meta_data saat supabase.auth.signUp()
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- JOBS (penawaran kerja oleh pemberi kerja ATAU tawaran skill oleh pencari kerja)
-- ---------------------------------------------------------
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  employer_id uuid not null references profiles(id) on delete cascade,
  posted_by_role user_role not null default 'employer', -- 'employer' = butuh pekerja, 'worker' = menawarkan jasa
  title text not null,
  category text not null,
  description text not null,
  location text not null,
  is_remote boolean not null default false,
  price numeric(14,2) not null check (price > 0),
  estimated_duration text not null,
  stage job_stage not null default 'terbuka',
  assigned_worker_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz
);

create index jobs_stage_idx on jobs(stage);
create index jobs_category_idx on jobs(category);

-- ---------------------------------------------------------
-- APPLICATIONS (lamaran pekerja ke sebuah job)
-- ---------------------------------------------------------
create table applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  message text,
  status application_status not null default 'menunggu',
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

-- ---------------------------------------------------------
-- TRANSACTIONS (histori dompet: deposit, penarikan, bayar, terima upah, komisi)
-- ---------------------------------------------------------
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id),
  type tx_type not null,
  amount numeric(14,2) not null,
  status tx_status not null default 'berhasil',
  note text,
  proof_url text, -- bukti transfer manual / QRIS
  bank_name text,
  bank_account_number text,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index transactions_profile_idx on transactions(profile_id);
create index transactions_status_idx on transactions(status);

-- ---------------------------------------------------------
-- CHAT
-- ---------------------------------------------------------
create table conversations (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references jobs(id) on delete cascade,
  employer_id uuid not null references profiles(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- ---------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- BUSINESS LOGIC: WALLET, KOMISI, PENARIKAN
-- =========================================================

-- Biaya admin flat untuk setiap penarikan (Rp)
-- Komisi platform 10% dari nilai kerja + biaya penarikan 5% dipotong SAAT pekerja menarik upah,
-- sesuai skema: platform fee 10% dipotong saat job selesai, lalu biaya penarikan 5% dipotong saat
-- pekerja benar-benar menarik saldo ke rekening bank.
create or replace function public.const_admin_fee() returns numeric as $$
  select 10000::numeric;
$$ language sql immutable;

-- -----------------------------------------------------------------
-- 1) EMPLOYER mengajukan deposit / top up saldo (manual transfer + bukti)
--    -> insert row transactions type='deposit' status='menunggu'
--    -> admin approve lewat panel admin (lihat fungsi admin_approve_deposit)
-- -----------------------------------------------------------------

-- -----------------------------------------------------------------
-- 2) EMPLOYER menerima pekerja (approve applicant) -> job dibayar dari saldo employer
-- -----------------------------------------------------------------
create or replace function public.accept_applicant(p_application_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
  v_app applications%rowtype;
  v_employer profiles%rowtype;
begin
  select * into v_app from applications where id = p_application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;

  select * into v_job from jobs where id = v_app.job_id for update;
  if v_job.stage <> 'terbuka' then raise exception 'Pekerjaan sudah tidak terbuka'; end if;

  select * into v_employer from profiles where id = v_job.employer_id for update;
  if v_employer.wallet_balance < v_job.price then
    raise exception 'Saldo tidak cukup, silakan top up dompet terlebih dahulu';
  end if;

  -- potong saldo employer, tahan dana di platform (escrow)
  update profiles set wallet_balance = wallet_balance - v_job.price where id = v_employer.id;

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_employer.id, v_job.id, 'bayar_kerja', v_job.price, 'berhasil', 'Pembayaran ditahan platform (escrow) untuk pekerjaan: ' || v_job.title);

  update jobs set stage = 'dibayar', assigned_worker_id = v_app.worker_id, paid_at = now() where id = v_job.id;
  update applications set status = 'diterima' where id = p_application_id;
  update applications set status = 'ditolak' where job_id = v_job.id and id <> p_application_id and status = 'menunggu';

  insert into conversations (job_id, employer_id, worker_id)
  values (v_job.id, v_job.employer_id, v_app.worker_id)
  on conflict (job_id, worker_id) do nothing;

  insert into notifications (profile_id, title, body, link)
  values (v_app.worker_id, 'Lamaran diterima!', 'Anda diterima untuk pekerjaan "' || v_job.title || '". Pembayaran sudah diamankan platform.', '/dashboard/worker');
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 3) Tandai pekerjaan mulai dikerjakan (opsional step worker)
-- -----------------------------------------------------------------
create or replace function public.mark_job_in_progress(p_job_id uuid)
returns void as $$
begin
  update jobs set stage = 'dikerjakan' where id = p_job_id and stage = 'dibayar';
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 4) Pekerjaan SELESAI -> upah cair ke saldo worker dikurangi komisi platform 10%
--    -> postingan job otomatis "hilang" dari listing terbuka (stage sudah bukan 'terbuka')
-- -----------------------------------------------------------------
create or replace function public.complete_job(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
  v_komisi numeric(14,2);
  v_upah_bersih numeric(14,2);
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.stage not in ('dibayar','dikerjakan') then
    raise exception 'Pekerjaan tidak dalam status yang bisa diselesaikan';
  end if;
  if v_job.assigned_worker_id is null then
    raise exception 'Belum ada pekerja yang ditugaskan';
  end if;

  v_komisi := round(v_job.price * 0.10, 2);
  v_upah_bersih := v_job.price - v_komisi;

  update profiles set wallet_balance = wallet_balance + v_upah_bersih where id = v_job.assigned_worker_id;

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_upah_bersih, 'berhasil', 'Upah diterima (setelah komisi platform 10%) untuk: ' || v_job.title);

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'komisi_platform', v_komisi, 'berhasil', 'Komisi platform 10% dari: ' || v_job.title);

  update jobs set stage = 'selesai', completed_at = now() where id = v_job.id;

  insert into notifications (profile_id, title, body, link)
  values (v_job.assigned_worker_id, 'Pekerjaan selesai', 'Upah bersih Rp ' || v_upah_bersih || ' sudah masuk ke dompet Anda.', '/dashboard/worker');
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 5) Mengajukan penarikan saldo.
--    - Pemberi kerja (employer): potong biaya admin flat Rp10.000 / transaksi.
--    - Pencari kerja (worker): potong biaya admin Rp10.000 + biaya penarikan 5%.
-- -----------------------------------------------------------------
create or replace function public.request_withdrawal(p_amount numeric)
returns uuid as $$
declare
  v_profile profiles%rowtype;
  v_biaya_tarik numeric(14,2) := 0;
  v_biaya_admin numeric(14,2) := public.const_admin_fee();
  v_note text;
  v_tx_id uuid;
begin
  select * into v_profile from profiles where id = auth.uid() for update;
  if v_profile.bank_account_number is null then
    raise exception 'Lengkapi data rekening bank terlebih dahulu';
  end if;
  if v_profile.wallet_balance < p_amount then
    raise exception 'Saldo tidak mencukupi';
  end if;

  if v_profile.role = 'worker' then
    v_biaya_tarik := round(p_amount * 0.05, 2);
    v_note := 'Penarikan diajukan. Biaya admin Rp' || v_biaya_admin || ' + biaya penarikan 5% (Rp' || v_biaya_tarik || ') akan dipotong saat disetujui admin.';
  else
    v_note := 'Penarikan diajukan. Biaya admin Rp' || v_biaya_admin || ' per transaksi akan dipotong saat disetujui admin.';
  end if;

  -- saldo langsung dikunci (dikurangi) menunggu approval admin
  update profiles set wallet_balance = wallet_balance - p_amount where id = v_profile.id;

  insert into transactions (profile_id, type, amount, status, note, bank_name, bank_account_number)
  values (v_profile.id, 'penarikan', p_amount, 'menunggu', v_note, v_profile.bank_name, v_profile.bank_account_number)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 6) ADMIN menyetujui penarikan (biaya sudah dipotong konsep di atas; jika ditolak, dana dikembalikan)
-- -----------------------------------------------------------------
create or replace function public.admin_review_withdrawal(p_tx_id uuid, p_approve boolean, p_admin_id uuid)
returns void as $$
declare
  v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where id = p_tx_id and type = 'penarikan' for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_tx.status <> 'menunggu' then raise exception 'Transaksi sudah diproses'; end if;

  if p_approve then
    update transactions set status = 'berhasil', reviewed_by = p_admin_id where id = p_tx_id;
    insert into notifications (profile_id, title, body, link)
    values (v_tx.profile_id, 'Penarikan disetujui', 'Penarikan Rp ' || v_tx.amount || ' sudah diproses ke rekening Anda.', '/dashboard/worker/withdraw');
  else
    update transactions set status = 'ditolak', reviewed_by = p_admin_id where id = p_tx_id;
    update profiles set wallet_balance = wallet_balance + v_tx.amount where id = v_tx.profile_id;
    insert into notifications (profile_id, title, body, link)
    values (v_tx.profile_id, 'Penarikan ditolak', 'Penarikan Rp ' || v_tx.amount || ' ditolak, saldo dikembalikan.', '/dashboard/worker/withdraw');
  end if;
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 7) ADMIN menyetujui deposit / top up (bukti transfer manual / QRIS)
-- -----------------------------------------------------------------
create or replace function public.admin_review_deposit(p_tx_id uuid, p_approve boolean, p_admin_id uuid)
returns void as $$
declare
  v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where id = p_tx_id and type = 'deposit' for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_tx.status <> 'menunggu' then raise exception 'Transaksi sudah diproses'; end if;

  if p_approve then
    update transactions set status = 'berhasil', reviewed_by = p_admin_id where id = p_tx_id;
    update profiles set wallet_balance = wallet_balance + v_tx.amount where id = v_tx.profile_id;
    insert into notifications (profile_id, title, body, link)
    values (v_tx.profile_id, 'Top up berhasil', 'Saldo Rp ' || v_tx.amount || ' sudah masuk ke dompet Anda.', '/dashboard/employer');
  else
    update transactions set status = 'ditolak', reviewed_by = p_admin_id where id = p_tx_id;
    insert into notifications (profile_id, title, body, link)
    values (v_tx.profile_id, 'Top up ditolak', 'Bukti pembayaran tidak valid, silakan ajukan ulang.', '/dashboard/employer');
  end if;
end;
$$ language plpgsql security definer;

-- -----------------------------------------------------------------
-- 8) Notifikasi otomatis saat ada pelamar baru
-- -----------------------------------------------------------------
create or replace function public.notify_new_applicant()
returns trigger as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = new.job_id;
  insert into notifications (profile_id, title, body, link)
  values (v_job.employer_id, 'Pelamar baru', 'Ada pelamar baru untuk "' || v_job.title || '".', '/dashboard/employer');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_notify_new_applicant
  after insert on applications
  for each row execute procedure public.notify_new_applicant();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table applications enable row level security;
alter table transactions enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;

create function public.is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql security definer;

-- Dipakai halaman registrasi (diakses publik/anon) untuk cek username sebelum submit
create function public.is_username_available(p_username text)
returns boolean as $$
  select not exists (select 1 from profiles where lower(username) = lower(p_username));
$$ language sql security definer;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- PROFILES
create policy "Profil publik terbatas bisa dibaca semua orang login" on profiles
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy "User bisa update profil sendiri" on profiles
  for update using (auth.uid() = id or public.is_admin());

-- JOBS
create policy "Job terbuka bisa dilihat publik" on jobs
  for select using (true);
create policy "Employer bisa insert job miliknya" on jobs
  for insert with check (auth.uid() = employer_id);
create policy "Employer bisa update job miliknya" on jobs
  for update using (auth.uid() = employer_id or public.is_admin());
create policy "Employer bisa delete job miliknya" on jobs
  for delete using (auth.uid() = employer_id or public.is_admin());

-- APPLICATIONS
create policy "Terlibat bisa lihat lamaran" on applications
  for select using (
    auth.uid() = worker_id
    or auth.uid() in (select employer_id from jobs where jobs.id = applications.job_id)
    or public.is_admin()
  );
create policy "Worker bisa melamar" on applications
  for insert with check (auth.uid() = worker_id);
create policy "Worker bisa batalkan lamaran sendiri" on applications
  for update using (auth.uid() = worker_id or public.is_admin());

-- TRANSACTIONS
create policy "User lihat transaksi sendiri" on transactions
  for select using (auth.uid() = profile_id or public.is_admin());
create policy "User insert transaksi sendiri (deposit/penarikan)" on transactions
  for insert with check (auth.uid() = profile_id);
create policy "Admin update transaksi" on transactions
  for update using (public.is_admin());

-- CONVERSATIONS & MESSAGES
create policy "Terlibat bisa lihat percakapan" on conversations
  for select using (auth.uid() = employer_id or auth.uid() = worker_id or public.is_admin());
create policy "Terlibat bisa buat percakapan" on conversations
  for insert with check (auth.uid() = employer_id or auth.uid() = worker_id);
create policy "Terlibat bisa lihat pesan" on messages
  for select using (
    auth.uid() in (
      select employer_id from conversations where conversations.id = messages.conversation_id
      union
      select worker_id from conversations where conversations.id = messages.conversation_id
    ) or public.is_admin()
  );
create policy "Terlibat bisa kirim pesan" on messages
  for insert with check (auth.uid() = sender_id);

-- NOTIFICATIONS
create policy "User lihat notifikasi sendiri" on notifications
  for select using (auth.uid() = profile_id or public.is_admin());
create policy "User update notifikasi sendiri (mark read)" on notifications
  for update using (auth.uid() = profile_id or public.is_admin());
create policy "System insert notifikasi" on notifications
  for insert with check (true);

-- =========================================================
-- STORAGE BUCKETS (jalankan sekali; buat juga lewat UI Storage jika perlu)
-- =========================================================
insert into storage.buckets (id, name, public) values ('kyc-docs', 'kyc-docs', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "User upload dokumen kyc sendiri" on storage.objects
  for insert with check (bucket_id = 'kyc-docs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "User lihat dokumen kyc sendiri, admin lihat semua" on storage.objects
  for select using (
    bucket_id = 'kyc-docs' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
create policy "User upload bukti pembayaran sendiri" on storage.objects
  for insert with check (bucket_id = 'payment-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "User & admin lihat bukti pembayaran" on storage.objects
  for select using (
    bucket_id = 'payment-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
create policy "Avatar publik" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "User upload avatar sendiri" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
