-- =====================================================================
-- KERJAHUB — MIGRATION 0041: LAPORAN KEUANGAN ADMIN
-- (Laba Rugi, Neraca Saldo, Komisi Upline)
--
-- Cara pakai: Supabase Dashboard -> SQL Editor -> paste semua isi file
-- ini -> Run. Aman dijalankan berkali-kali (CREATE OR REPLACE).
--
-- Sudah dicocokkan dengan skema live (dicek dari
-- information_schema.columns + migration 0001-0040):
--   transactions(id, profile_id, job_id, type, amount, status, note,
--                proof_url, bank_name, bank_account_number,
--                bank_account_holder, reviewed_by, created_at,
--                fee_amount, net_amount)
--   digital_orders(id, listing_id, buyer_id, seller_id, base_amount,
--                   unique_code, amount_final, status, ..., completed_at)
--   wallet_transactions(id, user_id, type, amount, reference_id, note,
--                        created_at)
--   escrow_payments(id, employer_id, worker_id, base_amount,
--                    wallet_deducted, total_amount, status, created_at)
--   profiles(..., referral_code, referred_by, role)
--
-- CATATAN PENTING soal komisi platform dari Marketplace Digital:
-- fungsi complete_digital_order() TIDAK menulis baris 'komisi_platform'
-- ke tabel transactions (beda dengan approve_completion() untuk
-- pekerjaan). Jadi pendapatan komisi marketplace dihitung ulang di sini
-- dari selisih digital_orders.base_amount dikurangi nominal bersih yang
-- masuk ke wallet_transactions milik penjual (type='marketplace_digital').
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) LABA RUGI
-- ---------------------------------------------------------------------
create or replace function public.admin_financial_summary(p_start timestamptz, p_end timestamptz)
returns table (
  pendapatan_komisi_kerja numeric,
  pendapatan_komisi_marketplace numeric,
  pendapatan_biaya_penarikan numeric,
  total_pendapatan numeric,
  beban_komisi_referral numeric,
  total_beban numeric,
  laba_bersih numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengakses laporan ini.';
  end if;

  return query
  with rev_kerja as (
    select coalesce(sum(amount), 0)::numeric as v
    from transactions
    where type = 'komisi_platform' and status = 'berhasil'
      and created_at >= p_start and created_at < p_end
  ),
  rev_marketplace as (
    select coalesce(sum(d.base_amount - wt.amount), 0)::numeric as v
    from digital_orders d
    join wallet_transactions wt on wt.reference_id = d.id and wt.type = 'marketplace_digital'
    where d.status = 'selesai'
      and d.completed_at >= p_start and d.completed_at < p_end
  ),
  rev_fee as (
    select coalesce(sum(fee_amount), 0)::numeric as v
    from transactions
    where type = 'penarikan' and status = 'berhasil'
      and created_at >= p_start and created_at < p_end
  ),
  exp_referral as (
    select coalesce(sum(amount), 0)::numeric as v
    from transactions
    where type = 'komisi_referral' and status = 'berhasil'
      and created_at >= p_start and created_at < p_end
  )
  select
    rev_kerja.v,
    rev_marketplace.v,
    rev_fee.v,
    rev_kerja.v + rev_marketplace.v + rev_fee.v,
    exp_referral.v,
    exp_referral.v,
    (rev_kerja.v + rev_marketplace.v + rev_fee.v) - exp_referral.v
  from rev_kerja, rev_marketplace, rev_fee, exp_referral;
end;
$$;

grant execute on function public.admin_financial_summary(timestamptz, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 2) NERACA SALDO: ringkasan mutasi per "akun" (jenis transaksi/sumber dana)
-- ---------------------------------------------------------------------
create or replace function public.admin_trial_balance(p_start timestamptz, p_end timestamptz)
returns table (
  akun text,
  jumlah_transaksi bigint,
  total_nominal numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengakses laporan ini.';
  end if;

  return query
  select t.type::text, count(*)::bigint, coalesce(sum(t.amount), 0)::numeric
  from transactions t
  where t.status = 'berhasil'
    and t.created_at >= p_start and t.created_at < p_end
  group by t.type

  union all

  select 'escrow_dikonfirmasi', count(*)::bigint, coalesce(sum(e.total_amount), 0)::numeric
  from escrow_payments e
  where e.status = 'berhasil'
    and e.created_at >= p_start and e.created_at < p_end
  having count(*) > 0

  union all

  select 'marketplace_dana_pembeli', count(*)::bigint, coalesce(sum(d.base_amount), 0)::numeric
  from digital_orders d
  where d.status = 'selesai'
    and d.completed_at >= p_start and d.completed_at < p_end
  having count(*) > 0

  union all

  select 'marketplace_dibayar_penjual', count(*)::bigint, coalesce(sum(wt.amount), 0)::numeric
  from wallet_transactions wt
  where wt.type = 'marketplace_digital'
    and wt.created_at >= p_start and wt.created_at < p_end
  having count(*) > 0

  order by total_nominal desc;
end;
$$;

grant execute on function public.admin_trial_balance(timestamptz, timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 3) KOMISI UPLINE: rincian komisi referral yang diterima tiap upline
-- ---------------------------------------------------------------------
create or replace function public.admin_upline_commission_report(p_start timestamptz, p_end timestamptz)
returns table (
  profile_id uuid,
  full_name text,
  referral_code text,
  jumlah_downline bigint,
  jumlah_transaksi_komisi bigint,
  total_komisi numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengakses laporan ini.';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.referral_code,
    (select count(*) from profiles d where d.referred_by = p.id)::bigint,
    count(t.id)::bigint,
    coalesce(sum(t.amount), 0)::numeric
  from profiles p
  join transactions t
    on t.profile_id = p.id
   and t.type = 'komisi_referral'
   and t.status = 'berhasil'
   and t.created_at >= p_start and t.created_at < p_end
  group by p.id, p.full_name, p.referral_code
  order by total_komisi desc;
end;
$$;

grant execute on function public.admin_upline_commission_report(timestamptz, timestamptz) to authenticated;
