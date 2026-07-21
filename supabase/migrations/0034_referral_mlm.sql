-- =========================================================
-- KERJAHUB — MIGRATION 0034: SISTEM REFERRAL / MLM 1 LEVEL
-- Jalankan SETELAH 0033 (wajib, karena memakai nilai enum
-- 'komisi_referral' yang ditambahkan di sana).
--
-- RINGKASAN FITUR:
-- 1) profiles.referral_code  -- kode 6 karakter unik tiap user,
--    dibuat otomatis saat registrasi, BISA diubah lewat menu akun.
-- 2) profiles.referred_by    -- upline, diisi SEKALI saat registrasi
--    dari kode referral yang dimasukkan calon user (opsional).
--    Setelah diisi, kolom ini IMMUTABLE (tidak bisa diubah lagi lewat
--    update apa pun) supaya tidak bisa disalahgunakan untuk membajak
--    komisi (lihat trigger protect_referral_columns di bawah).
-- 3) Komisi referral 1 level: setiap transaksi yang berhasil dari
--    seorang downline dan MENGHASILKAN KOMISI PLATFORM (baris
--    'komisi_platform' di tabel transactions -- saat ini dari
--    pekerjaan selesai & order marketplace digital selesai), upline-nya
--    otomatis mendapat 10% dari komisi platform tsb (dikonfigurasi
--    lewat platform_settings.referral_commission_percent), langsung
--    masuk wallet_balance + baris transaksi 'komisi_referral' +
--    notifikasi. Baris ini otomatis muncul di Riwayat Transaksi
--    upline maupun di Monitoring Transaksi admin karena keduanya
--    membaca dari tabel transactions yang sama.
-- =========================================================

-- ---------------------------------------------------------
-- 1) KOLOM BARU DI PROFILES
-- ---------------------------------------------------------
alter table profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references profiles(id);

create index if not exists profiles_referred_by_idx on profiles(referred_by);

-- ---------------------------------------------------------
-- 2) GENERATOR KODE REFERRAL 6 KARAKTER (huruf besar + angka,
--    tanpa karakter ambigu I/O/0/1) YANG DIJAMIN UNIK
-- ---------------------------------------------------------
create or replace function public.generate_unique_referral_code()
returns text as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1), '')
    into v_code
    from generate_series(1, 6);

    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$ language plpgsql;

-- Backfill untuk user yang sudah ada sebelum migration ini
update profiles set referral_code = public.generate_unique_referral_code() where referral_code is null;

alter table profiles alter column referral_code set not null;

alter table profiles
  add constraint profiles_referral_code_format check (referral_code ~ '^[A-Z0-9]{6}$');

create unique index if not exists profiles_referral_code_key on profiles (referral_code);

-- ---------------------------------------------------------
-- 3) PROTEKSI KOLOM REFERRAL:
--    - referral_code selalu disimpan huruf besar & auto-generate
--      kalau kosong saat insert.
--    - referred_by TIDAK BISA diubah lagi setelah diisi (mencegah
--      pembajakan komisi lewat update langsung ke tabel profiles).
-- ---------------------------------------------------------
create or replace function public.protect_referral_columns()
returns trigger as $$
begin
  if tg_op = 'INSERT' and new.referral_code is null then
    new.referral_code := public.generate_unique_referral_code();
  end if;

  if new.referral_code is not null then
    new.referral_code := upper(new.referral_code);
  end if;

  if tg_op = 'UPDATE' and new.referred_by is distinct from old.referred_by then
    new.referred_by := old.referred_by;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_referral_columns on profiles;
create trigger trg_protect_referral_columns
  before insert or update on profiles
  for each row execute procedure public.protect_referral_columns();

-- ---------------------------------------------------------
-- 4) DAFTAR (REGISTRASI): resolve kode referral opsional jadi
--    referred_by. Kode dikirim lewat raw_user_meta_data->>'referral_code'
--    saat supabase.auth.signUp().
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_ref_code text := upper(coalesce(new.raw_user_meta_data->>'referral_code', ''));
  v_upline uuid;
begin
  if v_ref_code <> '' then
    select id into v_upline from public.profiles where referral_code = v_ref_code;
  end if;

  insert into public.profiles (id, username, full_name, phone, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'phone',
    v_upline
  );
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 5) CEK KODE REFERRAL VALID (dipakai halaman registrasi, publik/anon,
--    pola sama seperti is_username_available)
-- ---------------------------------------------------------
create or replace function public.is_referral_code_valid(p_code text)
returns boolean as $$
  select exists (select 1 from profiles where referral_code = upper(trim(p_code)));
$$ language sql security definer stable;

grant execute on function public.is_referral_code_valid(text) to anon, authenticated;

-- ---------------------------------------------------------
-- 6) UBAH KODE REFERRAL SENDIRI (menu akun "Kode Referral Kamu")
-- ---------------------------------------------------------
create or replace function public.update_my_referral_code(p_new_code text)
returns text as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_new_code));
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'Kode referral harus 6 karakter, huruf/angka saja.';
  end if;
  if exists (select 1 from profiles where referral_code = v_code and id <> v_uid) then
    raise exception 'Kode referral sudah dipakai, coba kode lain.';
  end if;

  update profiles set referral_code = v_code where id = v_uid;
  return v_code;
end;
$$ language plpgsql security definer;

grant execute on function public.update_my_referral_code(text) to authenticated;

-- ---------------------------------------------------------
-- 7) INFO REFERRAL MILIK SENDIRI: kode, jumlah downline, total komisi
--    referral yang sudah diterima (dipakai menu akun)
-- ---------------------------------------------------------
create or replace function public.get_my_referral_info()
returns table (
  referral_code text,
  downline_count bigint,
  total_komisi_referral numeric
) as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Harus login'; end if;

  return query
  select
    p.referral_code,
    (select count(*) from profiles d where d.referred_by = v_uid),
    coalesce((
      select sum(t.amount) from transactions t
      where t.profile_id = v_uid and t.type = 'komisi_referral' and t.status = 'berhasil'
    ), 0)
  from profiles p
  where p.id = v_uid;
end;
$$ language plpgsql security definer stable;

grant execute on function public.get_my_referral_info() to authenticated;

-- ---------------------------------------------------------
-- 8) HELPER INTI: kreditkan komisi referral ke upline dari sebuah
--    downline, dipanggil dari fungsi mana pun yang menghasilkan
--    baris 'komisi_platform' (pekerjaan selesai, order marketplace
--    digital selesai, dst).
--    p_job_id boleh null (mis. untuk order marketplace yang bukan
--    baris di tabel jobs).
-- ---------------------------------------------------------
create or replace function public.credit_referral_commission(
  p_downline_id uuid,
  p_job_id uuid,
  p_platform_komisi numeric,
  p_note text
) returns void as $$
declare
  v_upline uuid;
  v_persen numeric := coalesce(public.get_setting_numeric('referral_commission_percent'), 10);
  v_jumlah numeric(14,2);
begin
  if p_platform_komisi is null or p_platform_komisi <= 0 then return; end if;

  select referred_by into v_upline from profiles where id = p_downline_id;
  if v_upline is null or v_upline = p_downline_id then return; end if;

  v_jumlah := round(p_platform_komisi * v_persen / 100, 2);
  if v_jumlah <= 0 then return; end if;

  update profiles set wallet_balance = wallet_balance + v_jumlah where id = v_upline;

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_upline, p_job_id, 'komisi_referral', v_jumlah, 'berhasil', p_note);

  insert into notifications (profile_id, title, body, link, category)
  values (v_upline, 'Komisi referral masuk!', 'Kamu mendapat komisi Rp' || v_jumlah || ' dari transaksi downline-mu.', '/dashboard/riwayat', 'komisi');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 9) SETTING PERSENTASE KOMISI REFERRAL (bisa diatur admin di
--    /admin/settings, halaman itu sudah baca semua baris
--    platform_settings secara dinamis)
-- ---------------------------------------------------------
insert into platform_settings (key, value, description) values
  ('referral_commission_percent', '10', 'Persentase komisi referral (MLM 1 level) untuk upline, dihitung dari komisi platform tiap transaksi sukses downline-nya')
on conflict (key) do nothing;

-- ---------------------------------------------------------
-- 10) HUBUNGKAN KE approve_completion() (pekerjaan selesai)
-- ---------------------------------------------------------
create or replace function public.approve_completion(p_job_id uuid, p_rating integer, p_review text)
returns void as $$
declare
  v_job jobs%rowtype;
  v_fee_percent numeric := coalesce(public.get_setting_numeric('platform_fee_percent'), 10);
  v_komisi numeric(14,2);
  v_upah_bersih numeric(14,2);
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.client_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage <> 'menunggu_konfirmasi_selesai' then raise exception 'Status tidak sesuai'; end if;

  v_komisi := round(v_job.price * v_fee_percent / 100, 2);
  v_upah_bersih := v_job.price - v_komisi;

  update profiles set
    wallet_balance = wallet_balance + v_upah_bersih,
    completed_jobs_count = completed_jobs_count + 1
  where id = v_job.assigned_worker_id;

  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_upah_bersih, 'berhasil',
    'Kamu berhasil menyelesaikan pekerjaan "' || v_job.title || '" dengan upah Rp' || v_job.price ||
    ', belum termasuk biaya fee ' || v_fee_percent || '% platform.');
  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'komisi_platform', v_komisi, 'berhasil', 'Komisi platform untuk: ' || v_job.title);

  perform public.credit_referral_commission(
    v_job.assigned_worker_id,
    v_job.id,
    v_komisi,
    'Komisi referral dari pekerjaan downline-mu: ' || v_job.title
  );

  update jobs set stage = 'selesai', completed_at = now(), finish_popup_seen = false where id = p_job_id;

  if p_rating is not null then
    insert into ratings (job_id, employer_id, worker_id, rating, review)
    values (p_job_id, v_job.client_id, v_job.assigned_worker_id, p_rating, p_review)
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

-- ---------------------------------------------------------
-- 11) HUBUNGKAN KE complete_digital_order() (order marketplace
--     digital selesai). job_id diisi null karena digital_orders
--     bukan baris di tabel jobs.
-- ---------------------------------------------------------
create or replace function public.complete_digital_order(p_order_id uuid)
returns void as $$
declare
  v_order digital_orders%rowtype;
  v_fee_percent numeric := coalesce(public.get_setting_numeric('marketplace_fee_percent'), 5);
  v_komisi numeric(14,2);
  v_bersih numeric(14,2);
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if v_order.status = 'selesai' then return; end if;

  v_komisi := round(v_order.base_amount * v_fee_percent / 100, 2);
  v_bersih := v_order.base_amount - v_komisi;

  update profiles set wallet_balance = wallet_balance + v_bersih where id = v_order.seller_id;
  update digital_orders set status = 'selesai', completed_at = now() where id = p_order_id;

  insert into wallet_transactions (user_id, type, amount, reference_id, note)
  values (v_order.seller_id, 'marketplace_digital', v_bersih, v_order.id, 'Hasil penjualan produk digital (setelah komisi platform ' || v_fee_percent || '%)');

  perform public.credit_referral_commission(
    v_order.seller_id,
    null,
    v_komisi,
    'Komisi referral dari penjualan produk digital downline-mu.'
  );

  insert into notifications (profile_id, title, body, link, category)
  values (v_order.seller_id, 'Transaksi selesai!', 'Dana Rp' || v_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/marketplace/orders', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 12) TAMPILKAN 'komisi_referral' DI RIWAYAT TRANSAKSI PENGGUNA
--     (masuk ke saldo upline sendiri, beda dengan 'komisi_platform'
--     yang cuma milik platform) DAN DI MONITORING ADMIN.
-- ---------------------------------------------------------
create or replace function public.get_all_transactions_admin()
returns table (
  source text,
  id uuid,
  tx_type text,
  status text,
  raw_status text,
  amount numeric,
  proof_url text,
  note text,
  user_name text,
  counterpart_name text,
  created_at timestamptz,
  fee_amount numeric,
  net_amount numeric,
  bank_name text,
  bank_account_number text,
  bank_account_holder text
) as $$
begin
  if not public.is_admin() then
    raise exception 'Tidak berhak';
  end if;

  return query
  select
    'transaction'::text as source,
    t.id,
    t.type::text as tx_type,
    case t.status::text
      when 'menunggu' then 'menunggu'
      when 'berhasil' then 'diterima'
      when 'ditolak' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else t.status::text
    end as status,
    t.status::text as raw_status,
    t.amount,
    t.proof_url,
    t.note,
    p.full_name as user_name,
    null::text as counterpart_name,
    t.created_at,
    t.fee_amount,
    t.net_amount,
    t.bank_name,
    t.bank_account_number,
    t.bank_account_holder
  from transactions t
  join profiles p on p.id = t.profile_id
  where t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund', 'terima_upah', 'komisi_platform', 'komisi_referral')

  union all

  select
    'topup_request', r.id, 'deposit',
    case r.status::text
      when 'pending' then 'menunggu'
      when 'paid' then 'diterima'
      when 'rejected' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else r.status::text
    end,
    r.status::text, r.amount_final, r.proof_url, null,
    p.full_name, null, r.created_at,
    null::numeric, null::numeric, null::text, null::text, null::text
  from topup_requests r
  join profiles p on p.id = r.user_id

  union all

  select
    'escrow_payment', e.id, 'bayar_kerja',
    case e.status::text
      when 'menunggu_pembayaran' then 'menunggu'
      when 'menunggu_konfirmasi_admin' then 'menunggu'
      when 'berhasil' then 'diterima'
      when 'ditolak' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else e.status::text
    end,
    e.status::text, (e.base_amount + e.wallet_deducted), e.proof_url, null,
    pe.full_name, pw.full_name, e.created_at,
    null::numeric, null::numeric, null::text, null::text, null::text
  from escrow_payments e
  join profiles pe on pe.id = e.employer_id
  join profiles pw on pw.id = e.worker_id

  union all

  select
    'digital_order', d.id, 'marketplace_digital',
    case d.status::text
      when 'menunggu_pembayaran' then 'menunggu'
      when 'menunggu_konfirmasi_admin' then 'menunggu'
      when 'dana_diamankan' then 'diterima'
      when 'menunggu_konfirmasi_selesai' then 'diterima'
      when 'selesai' then 'diterima'
      when 'sengketa' then 'menunggu'
      when 'dibatalkan' then 'dibatalkan'
      else d.status::text
    end,
    d.status::text, d.amount_final, d.proof_url, null,
    pb.full_name, ps.full_name, d.created_at,
    null::numeric, null::numeric, null::text, null::text, null::text
  from digital_orders d
  join profiles pb on pb.id = d.buyer_id
  join profiles ps on ps.id = d.seller_id

  order by created_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_all_transactions_admin() to authenticated;

create or replace function public.get_my_transactions()
returns table (
  source text,
  id uuid,
  tx_type text,
  status text,
  raw_status text,
  amount numeric,
  proof_url text,
  note text,
  counterpart_name text,
  created_at timestamptz,
  fee_amount numeric,
  net_amount numeric
) as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Harus login';
  end if;

  return query
  select
    'transaction'::text, t.id, t.type::text,
    case t.status::text
      when 'menunggu' then 'menunggu'
      when 'berhasil' then 'diterima'
      when 'ditolak' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else t.status::text
    end,
    t.status::text, t.amount, t.proof_url, t.note,
    null::text, t.created_at,
    t.fee_amount, t.net_amount
  from transactions t
  where t.profile_id = v_uid and t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund', 'terima_upah', 'komisi_referral')

  union all

  select
    'topup_request', r.id, 'deposit',
    case r.status::text
      when 'pending' then 'menunggu'
      when 'paid' then 'diterima'
      when 'rejected' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else r.status::text
    end,
    r.status::text, r.amount_final, r.proof_url, null,
    null, r.created_at,
    null::numeric, null::numeric
  from topup_requests r
  where r.user_id = v_uid

  union all

  select
    'escrow_payment', e.id, 'bayar_kerja',
    case e.status::text
      when 'menunggu_pembayaran' then 'menunggu'
      when 'menunggu_konfirmasi_admin' then 'menunggu'
      when 'berhasil' then 'diterima'
      when 'ditolak' then 'ditolak'
      when 'dibatalkan' then 'dibatalkan'
      else e.status::text
    end,
    e.status::text, (e.base_amount + e.wallet_deducted), e.proof_url, null,
    case when v_uid = e.employer_id then pw.full_name else pe.full_name end,
    e.created_at,
    null::numeric, null::numeric
  from escrow_payments e
  join profiles pe on pe.id = e.employer_id
  join profiles pw on pw.id = e.worker_id
  where v_uid in (e.employer_id, e.worker_id)

  union all

  select
    'digital_order', d.id, 'marketplace_digital',
    case d.status::text
      when 'menunggu_pembayaran' then 'menunggu'
      when 'menunggu_konfirmasi_admin' then 'menunggu'
      when 'dana_diamankan' then 'diterima'
      when 'menunggu_konfirmasi_selesai' then 'diterima'
      when 'selesai' then 'diterima'
      when 'sengketa' then 'menunggu'
      when 'dibatalkan' then 'dibatalkan'
      else d.status::text
    end,
    d.status::text, d.amount_final, d.proof_url, null,
    case when v_uid = d.buyer_id then ps.full_name else pb.full_name end,
    d.created_at,
    null::numeric, null::numeric
  from digital_orders d
  join profiles pb on pb.id = d.buyer_id
  join profiles ps on ps.id = d.seller_id
  where v_uid in (d.buyer_id, d.seller_id)

  order by created_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_my_transactions() to authenticated;
