-- =========================================================
-- KERJAHUB — MIGRATION 0028: PERBAIKAN RIWAYAT TRANSAKSI UPAH PEKERJA
-- Jalankan SETELAH 0027.
--
-- BUG 1: baris 'escrow_payment' di Riwayat Transaksi menampilkan
-- e.total_amount sebagai nominal -- sejak migration 0026 (potong saldo
-- otomatis), total_amount cuma mewakili SISA yang ditransfer manual
-- (bisa Rp 0 kalau lunas dari saldo), jadi nominalnya tidak lagi
-- mencerminkan nilai penuh sesuai yang dilamar/disepakati.
-- FIX: tampilkan (base_amount + wallet_deducted) = harga job penuh.
--
-- BUG 2: baris 'terima_upah' (upah bersih yang masuk ke saldo pekerja
-- setelah pekerjaan selesai & disetujui, dipotong komisi platform 10%)
-- TIDAK PERNAH ikut tampil di Riwayat Transaksi pekerja sama sekali --
-- get_my_transactions() & get_all_transactions_admin() cuma memfilter
-- t.type in ('deposit','penarikan','bayar_kerja','refund'), tidak ada
-- 'terima_upah'/'komisi_platform'.
-- FIX: tambahkan 'terima_upah' (dan 'komisi_platform' khusus admin)
-- ke filter, dan perjelas catatan kecil di baris 'terima_upah' supaya
-- menyebutkan nominal upah kotor (harga job) sebelum dipotong fee.
-- =========================================================

-- ---------------------------------------------------------
-- 1) approve_completion(): catatan 'terima_upah' sebutkan upah kotor
--    (harga job) & persentase fee dengan jelas
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

  update jobs set stage = 'selesai', completed_at = now() where id = p_job_id;

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
-- 2) get_all_transactions_admin(): escrow_payment pakai nominal penuh
--    (base_amount + wallet_deducted), dan ikutkan 'terima_upah' &
--    'komisi_platform' dari tabel transactions
-- ---------------------------------------------------------
drop function if exists public.get_all_transactions_admin();

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
  where t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund', 'terima_upah', 'komisi_platform')

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

-- ---------------------------------------------------------
-- 3) get_my_transactions(): escrow_payment pakai nominal penuh
--    (base_amount + wallet_deducted), dan ikutkan 'terima_upah'
--    (upah bersih pekerja) dari tabel transactions. 'komisi_platform'
--    SENGAJA tidak diikutkan di sini -- itu bukan transaksi milik
--    pekerja (tidak masuk/keluar dari saldonya), cukup tampil di
--    monitoring admin.
-- ---------------------------------------------------------
drop function if exists public.get_my_transactions();

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
  where t.profile_id = v_uid and t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund', 'terima_upah')

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
