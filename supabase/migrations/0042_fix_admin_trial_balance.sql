-- =====================================================================
-- KERJAHUB — MIGRATION 0042: FIX admin_trial_balance
-- Perbaikan error "invalid UNION/INTERSECT/EXCEPT ORDER BY clause"
-- Penyebab: ORDER BY setelah UNION harus mengacu ke nama kolom hasil,
-- padahal kolom pada SELECT sebelumnya tidak diberi alias.
-- Cara pakai: Supabase Dashboard -> SQL Editor -> paste semua isi file
-- ini -> Run.
-- =====================================================================

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
  select t.type::text as akun, count(*)::bigint as jumlah_transaksi, coalesce(sum(t.amount), 0)::numeric as total_nominal
  from transactions t
  where t.status = 'berhasil'
    and t.created_at >= p_start and t.created_at < p_end
  group by t.type

  union all

  select 'escrow_dikonfirmasi' as akun, count(*)::bigint as jumlah_transaksi, coalesce(sum(e.total_amount), 0)::numeric as total_nominal
  from escrow_payments e
  where e.status = 'berhasil'
    and e.created_at >= p_start and e.created_at < p_end
  having count(*) > 0

  union all

  select 'marketplace_dana_pembeli' as akun, count(*)::bigint as jumlah_transaksi, coalesce(sum(d.base_amount), 0)::numeric as total_nominal
  from digital_orders d
  where d.status = 'selesai'
    and d.completed_at >= p_start and d.completed_at < p_end
  having count(*) > 0

  union all

  select 'marketplace_dibayar_penjual' as akun, count(*)::bigint as jumlah_transaksi, coalesce(sum(wt.amount), 0)::numeric as total_nominal
  from wallet_transactions wt
  where wt.type = 'marketplace_digital'
    and wt.created_at >= p_start and wt.created_at < p_end
  having count(*) > 0

  order by total_nominal desc;
end;
$$;

grant execute on function public.admin_trial_balance(timestamptz, timestamptz) to authenticated;
