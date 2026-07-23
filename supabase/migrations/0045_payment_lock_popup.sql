-- =========================================================
-- KERJAHUB — MIGRATION 0045: POP-UP PEMBAYARAN OTOMATIS + KUNCI APP
-- Jalankan SETELAH 0001-0044.
--
-- Sebelumnya, begitu lamaran diterima dan job masuk stage
-- 'menunggu_pembayaran', pihak pembayar (employer/klien) HANYA dapat
-- notifikasi biasa -- tidak ada pop-up otomatis yang mengunci app
-- seperti stage lain (dana_diamankan, dikerjakan, dst di
-- get_my_active_job). Akibatnya banyak pembayaran menggantung karena
-- pembayar tidak sadar harus membayar.
--
-- FIX:
-- 1) get_my_active_job() sekarang IKUT mengembalikan job yang masih
--    'menunggu_pembayaran', plus detail escrow (escrow_id, escrow_status,
--    total_amount, base_amount, wallet_deducted, unique_code) supaya
--    frontend bisa menampilkan pop-up kunci app dengan CTA bayar.
-- 2) RPC baru cancel_pending_payment(): dipakai tombol "Batalkan" (merah)
--    di pop-up -- hanya boleh dipanggil oleh pembayar (client_id),
--    hanya selama escrow masih 'menunggu_pembayaran' atau 'ditolak'
--    (belum kirim bukti transfer). Mengembalikan saldo yang sempat
--    terpotong otomatis, membatalkan escrow & job, lalu app otomatis
--    ke-unlock karena job tidak lagi muncul di get_my_active_job().
-- =========================================================

-- ---------------------------------------------------------
-- 1) get_my_active_job(): tambahkan stage 'menunggu_pembayaran' +
--    detail escrow untuk pop-up pembayaran
-- ---------------------------------------------------------
drop function if exists public.get_my_active_job();

create or replace function public.get_my_active_job()
returns table (
  job_id uuid,
  title text,
  stage job_stage,
  category text,
  price numeric,
  my_role text,
  other_id uuid,
  other_name text,
  other_avatar text,
  other_phone text,
  conversation_id uuid,
  paid_at timestamptz,
  escrow_id uuid,
  escrow_status text,
  total_amount numeric,
  base_amount numeric,
  wallet_deducted numeric,
  unique_code integer
) as $$
  select
    j.id as job_id,
    j.title,
    j.stage,
    j.category,
    j.price,
    case when j.client_id = auth.uid() then 'employer' else 'worker' end as my_role,
    case when j.client_id = auth.uid() then j.assigned_worker_id else j.client_id end as other_id,
    op.full_name as other_name,
    op.avatar_url as other_avatar,
    op.phone as other_phone,
    c.id as conversation_id,
    j.paid_at,
    e.id as escrow_id,
    e.status::text as escrow_status,
    e.total_amount,
    e.base_amount,
    e.wallet_deducted,
    e.unique_code
  from jobs j
  left join profiles op
    on op.id = (case when j.client_id = auth.uid() then j.assigned_worker_id else j.client_id end)
  left join conversations c
    on c.job_id = j.id
    and c.employer_id = j.employer_id
    and c.worker_id = (case when j.assigned_worker_id = j.employer_id then j.client_id else j.assigned_worker_id end)
  left join lateral (
    select ep.* from escrow_payments ep
    where ep.job_id = j.id
    order by ep.created_at desc
    limit 1
  ) e on true
  where (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    and j.stage in ('menunggu_pembayaran', 'dana_diamankan', 'dikerjakan', 'menunggu_konfirmasi_selesai', 'revisi')
  order by
    case when j.stage = 'menunggu_pembayaran' then 0 else 1 end,
    j.paid_at desc nulls last
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_my_active_job() to authenticated;

-- ---------------------------------------------------------
-- 2) cancel_pending_payment(): pembayar membatalkan sendiri selama
--    belum kirim bukti transfer (belum masuk menunggu_konfirmasi_admin)
-- ---------------------------------------------------------
create or replace function public.cancel_pending_payment(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
  v_escrow escrow_payments%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if not found then raise exception 'Pekerjaan tidak ditemukan'; end if;
  if v_job.client_id <> auth.uid() then raise exception 'Tidak berhak membatalkan pembayaran ini'; end if;
  if v_job.stage <> 'menunggu_pembayaran' then raise exception 'Pekerjaan ini sudah tidak dalam status menunggu pembayaran'; end if;

  select * into v_escrow from escrow_payments where job_id = p_job_id order by created_at desc limit 1 for update;
  if not found then raise exception 'Data pembayaran tidak ditemukan'; end if;
  if v_escrow.status not in ('menunggu_pembayaran', 'ditolak') then
    raise exception 'Bukti pembayaran sudah dikirim dan sedang diverifikasi admin -- hubungi admin untuk membatalkan.';
  end if;

  update escrow_payments set status = 'dibatalkan' where id = v_escrow.id;
  update jobs set stage = 'dibatalkan' where id = p_job_id;

  if v_escrow.wallet_deducted > 0 then
    update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
    insert into transactions (profile_id, job_id, type, amount, status, note)
    values (v_escrow.employer_id, p_job_id, 'refund', v_escrow.wallet_deducted, 'berhasil',
      'Pengembalian saldo karena pembayaran untuk "' || v_job.title || '" dibatalkan sendiri oleh pembayar.');
  end if;

  insert into notifications (profile_id, title, body, link, category)
  values (v_escrow.employer_id, 'Pembayaran dibatalkan', 'Kamu membatalkan pembayaran untuk "' || v_job.title || '".' ||
    (case when v_escrow.wallet_deducted > 0 then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
    '/dashboard/riwayat', 'pembayaran');
  insert into notifications (profile_id, title, body, link, category)
  values (v_escrow.worker_id, 'Kerja sama dibatalkan', 'Pembayaran untuk "' || v_job.title || '" dibatalkan oleh ' ||
    (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '.', '/dashboard/worker', 'pembayaran');

  perform public.write_audit('cancel_pending_payment', 'jobs', p_job_id, jsonb_build_object('escrow_id', v_escrow.id, 'wallet_refunded', v_escrow.wallet_deducted));
end;
$$ language plpgsql security definer;

grant execute on function public.cancel_pending_payment(uuid) to authenticated;
