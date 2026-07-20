-- =========================================================
-- KERJAHUB — MIGRATION 0016: MONITORING TRANSAKSI TERPADU
-- Jalankan SETELAH 0015 (wajib, karena memakai status 'dibatalkan'
-- yang baru ditambahkan di sana).
--
-- Isi migration ini:
-- 1) get_all_transactions_admin()  -> dipakai halaman admin
--    /admin/transactions, menggabungkan SEMUA jenis transaksi
--    (top up dompet lama, permintaan top up baru, penarikan,
--    pembayaran escrow job, order marketplace digital) jadi satu
--    daftar dengan status yang diseragamkan:
--    menunggu | diterima | ditolak | dibatalkan
-- 2) get_my_transactions()         -> dipakai halaman pengguna
--    "Riwayat Transaksi" di dasbor, hanya menampilkan transaksi
--    milik user yang sedang login (atau yang melibatkan dia,
--    utk escrow/order marketplace).
-- 3) admin_action_transaction(p_source, p_id, p_action)
--    -> satu RPC untuk 3 tombol aksi admin: 'terima', 'tolak',
--    'batalkan'. Untuk terima/tolak, fungsi ini MEMANGGIL ULANG
--    fungsi admin yang sudah ada (admin_review_deposit,
--    admin_review_withdrawal, admin_review_topup,
--    admin_confirm_escrow, admin_confirm_digital_payment) supaya
--    semua logika bisnis yang sudah teruji (potong komisi,
--    kembalikan saldo, dsb) tetap sama persis. Hanya aksi
--    'batalkan' yang logikanya baru (belum ada sebelumnya).
-- 4) auto_cancel_expired_transactions()
--    -> membatalkan otomatis transaksi yang statusnya masih
--    menunggu DAN belum ada bukti transfer diunggah (proof_url
--    kosong) setelah 6 jam. Penarikan saldo TIDAK kena aturan
--    ini (penarikan menunggu proses admin transfer, bukan
--    menunggu user upload bukti, jadi tidak adil kalau ikut
--    dibatalkan otomatis).
--    Fungsi ini dipanggil dari sisi aplikasi setiap kali halaman
--    admin "Monitoring Transaksi" atau halaman pengguna "Riwayat
--    Transaksi" dibuka (bukan lewat pg_cron), jadi tidak perlu
--    extension tambahan di Supabase.
-- =========================================================

-- ---------------------------------------------------------
-- 1) DAFTAR SEMUA TRANSAKSI — UNTUK ADMIN
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
  created_at timestamptz
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
    t.created_at
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
    p.full_name, null, r.created_at
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
    pe.full_name, pw.full_name, e.created_at
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
    pb.full_name, ps.full_name, d.created_at
  from digital_orders d
  join profiles pb on pb.id = d.buyer_id
  join profiles ps on ps.id = d.seller_id

  order by created_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_all_transactions_admin() to authenticated;

-- ---------------------------------------------------------
-- 2) DAFTAR TRANSAKSI MILIK SENDIRI — UNTUK PENGGUNA
-- ---------------------------------------------------------
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
  created_at timestamptz
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
    null::text, t.created_at
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
    null, r.created_at
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
    e.created_at
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
    d.created_at
  from digital_orders d
  join profiles pb on pb.id = d.buyer_id
  join profiles ps on ps.id = d.seller_id
  where v_uid in (d.buyer_id, d.seller_id)

  order by created_at desc;
end;
$$ language plpgsql security definer;

grant execute on function public.get_my_transactions() to authenticated;

-- ---------------------------------------------------------
-- 3) SATU RPC UNTUK TOMBOL TERIMA / TOLAK / BATALKAN
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
      update jobs set stage = 'dibatalkan' where id = v_escrow.job_id;
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.employer_id, 'Pembayaran job dibatalkan', 'Pembayaran escrow dibatalkan oleh admin, pekerjaan ikut dibatalkan.', '/dashboard/employer', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.worker_id, 'Job dibatalkan', 'Pembayaran dari pemberi kerja dibatalkan oleh admin, pekerjaan ini dibatalkan.', '/dashboard/worker', 'pembayaran');
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

grant execute on function public.admin_action_transaction(text, uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 4) AUTO-CANCEL: transaksi tanpa bukti transfer setelah 6 jam
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
  for v_row in
    select * from escrow_payments
    where status = 'menunggu_pembayaran' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update escrow_payments set status = 'dibatalkan' where id = v_row.id;
    update jobs set stage = 'dibatalkan' where id = v_row.job_id and stage in ('menunggu_pembayaran', 'diterima');
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.employer_id, 'Pembayaran job dibatalkan otomatis', 'Pembayaran job dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/employer', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.worker_id, 'Job dibatalkan otomatis', 'Pemberi kerja tidak menyelesaikan pembayaran dalam 6 jam, job ini dibatalkan otomatis.', '/dashboard/worker', 'pembayaran');
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
  -- auto-cancel, karena user tidak perlu upload bukti apa pun —
  -- yang ditunggu justru admin yang memproses transfer.
end;
$$ language plpgsql security definer;

grant execute on function public.auto_cancel_expired_transactions() to authenticated;
