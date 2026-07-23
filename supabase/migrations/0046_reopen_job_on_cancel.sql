-- =========================================================
-- KERJAHUB — MIGRATION 0046: POSTINGAN DIBUKA LAGI SETELAH DIBATALKAN
-- Jalankan SETELAH 0001-0045.
--
-- Sebelumnya, begitu pembayaran escrow dibatalkan (oleh admin, otomatis
-- setelah 6 jam, atau oleh pembayar sendiri lewat pop-up baru di 0045),
-- job langsung diberi stage = 'dibatalkan' dan TIDAK PERNAH muncul lagi
-- di beranda (beranda cuma tampilkan stage = 'terbuka'). Postingan jadi
-- "hilang" permanen walau sebenarnya belum ada yang bekerja sama sekali.
--
-- FIX: pada SEMUA jalur pembatalan (admin, auto-cancel 6 jam, batalkan
-- sendiri), job dikembalikan ke stage = 'terbuka' (bukan 'dibatalkan')
-- supaya otomatis tampil lagi di beranda dan bisa dilamar/dipesan siapa
-- pun dari awal. Aman dilakukan di baris job yang SAMA karena pembatalan
-- hanya mungkin terjadi selagi job masih di stage 'menunggu_pembayaran'
-- (atau 'diterima' lama) -- belum ada foto pekerjaan/rating yang nempel
-- di baris itu (baru muncul jauh setelah dana diamankan & mulai
-- dikerjakan), beda dengan kasus job yang sudah 'selesai' di migration
-- 0032 yang sengaja dibuatkan baris baru karena riwayatnya sudah "kotor".
--
-- Lamaran yang sempat diterima juga dikembalikan statusnya jadi
-- 'dibatalkan' (bukan tetap 'diterima') supaya tidak membingungkan saat
-- job sudah terbuka lagi untuk pelamar baru.
-- =========================================================

-- ---------------------------------------------------------
-- 1) cancel_pending_payment() -- batalkan sendiri oleh pembayar (0045)
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

  -- Buka lagi postingannya supaya tampil di beranda & bisa dilamar/dipesan
  -- ulang oleh siapa pun, bukan ditutup permanen.
  update jobs
  set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null
  where id = p_job_id;

  update applications set status = 'dibatalkan' where job_id = p_job_id and status = 'diterima';

  if v_escrow.wallet_deducted > 0 then
    update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
    insert into transactions (profile_id, job_id, type, amount, status, note)
    values (v_escrow.employer_id, p_job_id, 'refund', v_escrow.wallet_deducted, 'berhasil',
      'Pengembalian saldo karena pembayaran untuk "' || v_job.title || '" dibatalkan sendiri oleh pembayar.');
  end if;

  insert into notifications (profile_id, title, body, link, category)
  values (v_escrow.employer_id, 'Pembayaran dibatalkan', 'Kamu membatalkan pembayaran untuk "' || v_job.title || '". Postingan dibuka lagi.' ||
    (case when v_escrow.wallet_deducted > 0 then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
    '/dashboard/riwayat', 'pembayaran');
  insert into notifications (profile_id, title, body, link, category)
  values (v_escrow.worker_id, 'Kerja sama dibatalkan', 'Pembayaran untuk "' || v_job.title || '" dibatalkan oleh ' ||
    (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '. Postingan dibuka lagi.', '/dashboard/worker', 'pembayaran');

  perform public.write_audit('cancel_pending_payment', 'jobs', p_job_id, jsonb_build_object('escrow_id', v_escrow.id, 'wallet_refunded', v_escrow.wallet_deducted, 'reopened', true));
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 2) admin_action_transaction() -- pembatalan oleh admin
-- ---------------------------------------------------------
create or replace function public.admin_action_transaction(p_source text, p_id uuid, p_action text)
returns void as $$
declare
  v_admin uuid := auth.uid();
  v_tx transactions%rowtype;
  v_req topup_requests%rowtype;
  v_escrow escrow_payments%rowtype;
  v_order digital_orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Tidak berhak';
  end if;
  if p_action not in ('terima', 'tolak', 'batalkan') then
    raise exception 'Aksi tidak dikenal';
  end if;

  -- ===== transactions (deposit lama & penarikan) =====
  if p_source = 'transaction' then
    select * into v_tx from transactions where id = p_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_tx.status <> 'menunggu' then raise exception 'Transaksi sudah diproses'; end if;

    if p_action = 'terima' then
      if v_tx.type = 'deposit' then
        perform public.admin_review_deposit(p_id, true, v_admin);
      elsif v_tx.type = 'penarikan' then
        perform public.admin_review_withdrawal(p_id, true, v_admin);
      else
        raise exception 'Jenis transaksi ini tidak bisa diterima manual';
      end if;
    elsif p_action = 'tolak' then
      if v_tx.type = 'deposit' then
        perform public.admin_review_deposit(p_id, false, v_admin);
      elsif v_tx.type = 'penarikan' then
        perform public.admin_review_withdrawal(p_id, false, v_admin);
      else
        raise exception 'Jenis transaksi ini tidak bisa ditolak manual';
      end if;
    elsif p_action = 'batalkan' then
      update transactions set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;
      if v_tx.type = 'penarikan' then
        update profiles set wallet_balance = wallet_balance + v_tx.amount where id = v_tx.profile_id;
      end if;
      insert into notifications (profile_id, title, body, link, category)
      values (v_tx.profile_id, 'Transaksi dibatalkan', 'Transaksi Rp ' || v_tx.amount || ' dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
    end if;

  -- ===== topup_requests (permintaan top up baru) =====
  elsif p_source = 'topup_request' then
    select * into v_req from topup_requests where id = p_id for update;
    if not found then raise exception 'Permintaan top up tidak ditemukan'; end if;
    if v_req.status <> 'pending' then raise exception 'Permintaan sudah diproses'; end if;

    if p_action = 'terima' then
      perform public.admin_review_topup(p_id, true);
    elsif p_action = 'tolak' then
      perform public.admin_review_topup(p_id, false);
    elsif p_action = 'batalkan' then
      update topup_requests set status = 'dibatalkan', reviewed_by = v_admin, reviewed_at = now() where id = p_id;
      insert into notifications (profile_id, title, body, link, category)
      values (v_req.user_id, 'Top up dibatalkan', 'Permintaan top up Rp ' || v_req.amount_final || ' dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
    end if;

  -- ===== escrow_payments (pembayaran job) =====
  elsif p_source = 'escrow_payment' then
    select * into v_escrow from escrow_payments where id = p_id for update;
    if not found then raise exception 'Pembayaran escrow tidak ditemukan'; end if;

    if p_action = 'terima' then
      if v_escrow.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk dikonfirmasi'; end if;
      perform public.admin_confirm_escrow(p_id, true, v_admin);
    elsif p_action = 'tolak' then
      if v_escrow.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk ditolak'; end if;
      perform public.admin_confirm_escrow(p_id, false, v_admin);
    elsif p_action = 'batalkan' then
      if v_escrow.status not in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin') then
        raise exception 'Transaksi sudah final, tidak bisa dibatalkan';
      end if;
      update escrow_payments set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;

      -- Buka lagi postingannya supaya tampil di beranda & bisa dilamar/dipesan
      -- ulang oleh siapa pun, bukan ditutup permanen.
      update jobs
      set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null
      where id = v_escrow.job_id;
      update applications set status = 'dibatalkan' where job_id = v_escrow.job_id and status = 'diterima';

      if v_escrow.wallet_deducted > 0 then
        update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
        insert into transactions (profile_id, job_id, type, amount, status, note)
        values (v_escrow.employer_id, v_escrow.job_id, 'refund', v_escrow.wallet_deducted, 'berhasil',
          'Pengembalian saldo karena pembayaran escrow dibatalkan admin.');
      end if;
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.employer_id, 'Pembayaran job dibatalkan', 'Pembayaran escrow dibatalkan oleh admin, postingan dibuka lagi.' ||
        (case when v_escrow.wallet_deducted > 0 then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
        '/dashboard/employer', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.worker_id, 'Job dibatalkan', 'Pembayaran dari pemberi kerja dibatalkan oleh admin, postingan dibuka lagi.', '/dashboard/worker', 'pembayaran');
    end if;

  -- ===== digital_orders (order marketplace digital) =====
  elsif p_source = 'digital_order' then
    select * into v_order from digital_orders where id = p_id for update;
    if not found then raise exception 'Order tidak ditemukan'; end if;

    if p_action = 'terima' then
      if v_order.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk dikonfirmasi'; end if;
      perform public.admin_confirm_digital_payment(p_id, true);
    elsif p_action = 'tolak' then
      if v_order.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk ditolak'; end if;
      perform public.admin_confirm_digital_payment(p_id, false);
    elsif p_action = 'batalkan' then
      if v_order.status not in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin') then
        raise exception 'Order sudah final, tidak bisa dibatalkan';
      end if;
      update digital_orders set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;
      insert into notifications (profile_id, title, body, link, category)
      values (v_order.buyer_id, 'Order dibatalkan', 'Order marketplace kamu dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_order.seller_id, 'Order dibatalkan', 'Order untuk produkmu dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
    end if;

  else
    raise exception 'Sumber transaksi tidak dikenal';
  end if;

  perform public.write_audit('admin_action_transaction', p_source, p_id, jsonb_build_object('action', p_action));
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) auto_cancel_expired_transactions() -- pembatalan otomatis 6 jam
-- ---------------------------------------------------------
create or replace function public.auto_cancel_expired_transactions()
returns void as $$
declare
  v_row record;
begin
  -- Top up dompet lama (transactions type deposit)
  for v_row in
    select * from transactions
    where type = 'deposit' and status = 'menunggu' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update transactions set status = 'dibatalkan' where id = v_row.id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.profile_id, 'Top up dibatalkan otomatis', 'Top up Rp ' || v_row.amount || ' dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Permintaan top up baru (topup_requests)
  for v_row in
    select * from topup_requests
    where status = 'pending' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update topup_requests set status = 'dibatalkan', reviewed_at = now() where id = v_row.id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.user_id, 'Top up dibatalkan otomatis', 'Permintaan top up Rp ' || v_row.amount_final || ' dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Pembayaran escrow job yang belum diupload buktinya
  -- (status masih 'menunggu_pembayaran' -- escrow yang lunas otomatis
  -- dari saldo sudah langsung 'berhasil' jadi tidak pernah kena sini)
  for v_row in
    select * from escrow_payments
    where status = 'menunggu_pembayaran' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update escrow_payments set status = 'dibatalkan' where id = v_row.id;

    -- Buka lagi postingannya supaya tampil di beranda & bisa dilamar/dipesan
    -- ulang oleh siapa pun, bukan ditutup permanen.
    update jobs
    set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null
    where id = v_row.job_id and stage in ('menunggu_pembayaran', 'diterima');
    update applications set status = 'dibatalkan' where job_id = v_row.job_id and status = 'diterima';

    if v_row.wallet_deducted > 0 then
      update profiles set wallet_balance = wallet_balance + v_row.wallet_deducted where id = v_row.employer_id;
      insert into transactions (profile_id, job_id, type, amount, status, note)
      values (v_row.employer_id, v_row.job_id, 'refund', v_row.wallet_deducted, 'berhasil',
        'Pengembalian saldo karena pembayaran escrow dibatalkan otomatis (6 jam tanpa bukti transfer).');
    end if;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.employer_id, 'Pembayaran job dibatalkan otomatis', 'Pembayaran job dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam. Postingan dibuka lagi.' ||
      (case when v_row.wallet_deducted > 0 then ' Saldo Rp' || v_row.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
      '/dashboard/employer', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.worker_id, 'Job dibatalkan otomatis', 'Pemberi kerja tidak menyelesaikan pembayaran dalam 6 jam, postingan dibuka lagi.', '/dashboard/worker', 'pembayaran');
  end loop;

  -- Order marketplace digital yang belum diupload buktinya
  for v_row in
    select * from digital_orders
    where status = 'menunggu_pembayaran' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update digital_orders set status = 'dibatalkan' where id = v_row.id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.buyer_id, 'Order dibatalkan otomatis', 'Order marketplace dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Catatan: penarikan saldo ('penarikan') SENGAJA tidak kena
  -- auto-cancel, karena user tidak perlu upload bukti apa pun --
  -- yang ditunggu justru admin yang memproses transfer.
end;
$$ language plpgsql security definer;
