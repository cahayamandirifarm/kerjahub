-- =========================================================
-- KERJAHUB — MIGRATION 0018: FEE PENARIKAN 2% (MAKS Rp10.000)
-- Jalankan SETELAH 0017.
--
-- Perubahan:
-- 1) Skema fee penarikan LAMA (employer: flat Rp10.000/transaksi,
--    worker: flat Rp10.000 + 5% dari nominal) DIGANTI jadi SATU
--    aturan yang sama untuk employer maupun worker:
--       biaya admin = 2% dari nominal penarikan, MAKSIMAL Rp10.000
--    Contoh: tarik Rp100.000 -> fee Rp2.000 (2% karena < Rp10.000)
--            tarik Rp2.000.000 -> fee Rp10.000 (kena batas maksimal)
-- 2) Tabel transactions menyimpan snapshot nominal bersih
--    (net_amount), besaran fee (fee_amount), dan data rekening
--    tujuan lengkap (bank_name, bank_account_number,
--    bank_account_holder) di SETIAP pengajuan penarikan — supaya
--    admin & user tidak perlu hitung ulang manual dan datanya
--    tidak berubah walau user edit rekening setelahnya.
-- =========================================================

alter table transactions add column if not exists fee_amount numeric(14,2);
alter table transactions add column if not exists net_amount numeric(14,2);
alter table transactions add column if not exists bank_account_holder text;

-- ---------------------------------------------------------
-- request_withdrawal: hitung fee 2% (maks Rp10.000), simpan
-- snapshot rekening & nominal bersih.
-- ---------------------------------------------------------
create or replace function public.request_withdrawal(p_amount numeric)
returns uuid as $$
declare
  v_profile profiles%rowtype;
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_note text;
  v_tx_id uuid;
begin
  select * into v_profile from profiles where id = auth.uid() for update;
  if v_profile.bank_account_number is null then
    raise exception 'Lengkapi data rekening bank/e-wallet terlebih dahulu';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Jumlah penarikan tidak valid';
  end if;
  if v_profile.wallet_balance < p_amount then
    raise exception 'Saldo tidak mencukupi';
  end if;

  v_fee := least(round(p_amount * 0.02, 2), 10000);
  v_net := p_amount - v_fee;

  v_note := 'Penarikan diajukan. Biaya admin platform 2% (maks Rp10.000): Rp' || v_fee
    || '. Nominal bersih yang akan diterima: Rp' || v_net || '.';

  -- saldo langsung dikunci (dikurangi) menunggu approval admin
  update profiles set wallet_balance = wallet_balance - p_amount where id = v_profile.id;

  insert into transactions (
    profile_id, type, amount, status, note,
    bank_name, bank_account_number, bank_account_holder,
    fee_amount, net_amount
  )
  values (
    v_profile.id, 'penarikan', p_amount, 'menunggu', v_note,
    v_profile.bank_name, v_profile.bank_account_number, v_profile.bank_account_holder,
    v_fee, v_net
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- Perbarui pesan notifikasi supaya sebut nominal bersih, bukan cuma nominal kotor.
-- ---------------------------------------------------------
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
    insert into notifications (profile_id, title, body, link, category)
    values (
      v_tx.profile_id, 'Penarikan disetujui',
      'Penarikan disetujui. Nominal bersih Rp ' || coalesce(v_tx.net_amount, v_tx.amount) || ' akan ditransfer ke rekening/e-wallet kamu.',
      '/dashboard/riwayat', 'pembayaran'
    );
  else
    update transactions set status = 'ditolak', reviewed_by = p_admin_id where id = p_tx_id;
    update profiles set wallet_balance = wallet_balance + v_tx.amount where id = v_tx.profile_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_tx.profile_id, 'Penarikan ditolak', 'Penarikan Rp ' || v_tx.amount || ' ditolak, saldo dikembalikan.', '/dashboard/riwayat', 'pembayaran');
  end if;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- get_all_transactions_admin: tambah kolom fee_amount, net_amount,
-- dan data rekening tujuan (khusus baris penarikan).
-- Ganti tanda tangan (return type berubah) jadi harus DROP dulu.
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
  where t.type in ('deposit', 'penarikan')

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
    e.status::text, e.total_amount, e.proof_url, null,
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
-- get_my_transactions: tambah kolom fee_amount & net_amount
-- supaya dasbor user bisa tampilkan nominal bersih penarikan.
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
  where t.profile_id = v_uid and t.type in ('deposit', 'penarikan')

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
    e.status::text, e.total_amount, e.proof_url, null,
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
