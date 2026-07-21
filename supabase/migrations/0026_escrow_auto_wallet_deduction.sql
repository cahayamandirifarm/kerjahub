-- =========================================================
-- KERJAHUB — MIGRATION 0026: ESCROW OTOMATIS POTONG SALDO DOMPET
-- Jalankan SETELAH 0001-0025.
--
-- BUG: accept_applicant() SELALU membuat escrow dengan status
-- 'menunggu_pembayaran' senilai penuh harga job + kode unik, dan
-- memaksa pihak pembayar transfer manual ke rekening bank -- padahal
-- wallet_balance milik pembayar sama sekali tidak dicek/dipakai.
-- Akibatnya pengguna yang saldonya cukup (bahkan lebih dari cukup)
-- tetap harus transfer manual dari luar.
--
-- FIX:
-- 1) Saat lamaran diterima, potong dulu wallet_balance pembayar
--    sebanyak yang tersedia (maksimal sebesar harga job).
-- 2) Jika saldo mencukupi seluruh harga job -> escrow langsung
--    berstatus 'berhasil' (setara admin_confirm_escrow approve),
--    job langsung 'dana_diamankan', TANPA perlu upload bukti transfer
--    sama sekali.
-- 3) Jika saldo mencukupi sebagian -> escrow tetap 'menunggu_pembayaran'
--    tapi jumlah yang wajib ditransfer manual (base_amount/total_amount)
--    HANYA sebesar kekurangannya, bukan harga penuh lagi.
-- 4) Jika saldo pembayar 0 -> perilaku sama seperti sebelumnya (transfer
--    penuh), tidak ada perubahan.
-- 5) Setiap potongan saldo otomatis dicatat di tabel transactions
--    (type 'bayar_kerja') supaya tercatat di Riwayat Transaksi.
-- 6) Kalau escrow yang sudah kepotong sebagian saldonya kemudian
--    dibatalkan (oleh admin lewat admin_action_transaction, atau
--    otomatis lewat auto_cancel_expired_transactions karena bukti
--    tidak diunggah dalam 6 jam), saldo yang sempat terpotong WAJIB
--    dikembalikan ke pembayar dan dicatat sebagai 'refund'.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom baru: catat berapa yang sudah dipotong otomatis dari saldo
-- ---------------------------------------------------------
alter table escrow_payments add column if not exists wallet_deducted numeric(14,2) not null default 0;

-- ---------------------------------------------------------
-- 2) accept_applicant(): potong saldo dulu, baru sisanya (jika ada)
--    yang wajib ditransfer manual
-- ---------------------------------------------------------
create or replace function public.accept_applicant(p_application_id uuid)
returns table (escrow_id uuid, payer_id uuid) as $$
declare
  v_job jobs%rowtype;
  v_app applications%rowtype;
  v_code integer;
  v_bank bank_accounts%rowtype;
  v_escrow_id uuid;
  v_payer_id uuid;          -- pihak yang WAJIB bayar (= client_id)
  v_payee_id uuid;          -- pihak yang mengerjakan & menerima dana (= assigned_worker_id)
  v_payer_balance numeric(14,2);
  v_wallet_deduct numeric(14,2);
  v_remaining numeric(14,2);
  v_status escrow_status;
begin
  select * into v_app from applications where id = p_application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;

  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  select * into v_job from jobs where id = v_app.job_id for update;
  if v_job.stage <> 'terbuka' then raise exception 'Pekerjaan sudah tidak terbuka'; end if;

  if v_job.posted_by_role = 'worker' then
    -- Postingan jasa/mencari kerja: pembuat postingan (employer_id) ADALAH
    -- pekerja yang mengerjakan & menerima upah. Pelamar = klien yang
    -- tertarik & wajib bayar + berhak approve hasil kerja.
    v_payee_id := v_job.employer_id;
    v_payer_id := v_app.worker_id;
  else
    -- Lowongan kerja biasa: perilaku lama, tidak berubah.
    v_payer_id := v_job.employer_id;
    v_payee_id := v_app.worker_id;
  end if;

  -- Kunci baris saldo pembayar supaya tidak ada race condition kalau
  -- ada aksi lain yang memotong saldo di saat bersamaan.
  select wallet_balance into v_payer_balance from profiles where id = v_payer_id for update;
  v_wallet_deduct := least(coalesce(v_payer_balance, 0), v_job.price);
  v_remaining := v_job.price - v_wallet_deduct;

  if v_wallet_deduct > 0 then
    update profiles set wallet_balance = wallet_balance - v_wallet_deduct where id = v_payer_id;
    insert into transactions (profile_id, job_id, type, amount, status, note)
    values (v_payer_id, v_job.id, 'bayar_kerja', v_wallet_deduct, 'berhasil',
      'Dipotong otomatis dari saldo untuk: ' || v_job.title ||
      (case when v_remaining > 0 then ' (sisa wajib transfer manual)' else ' (lunas dari saldo)' end));
  end if;

  if v_remaining > 0 then
    -- Saldo tidak cukup / tidak ada -- sisanya tetap wajib transfer manual,
    -- sama seperti alur lama, hanya saja nominalnya sudah dikurangi saldo.
    select * into v_bank from bank_accounts where is_active = true order by created_at limit 1;
    loop
      v_code := floor(random() * 900 + 100)::integer;
      exit when not exists (
        select 1 from escrow_payments
        where unique_code = v_code and status in ('menunggu_pembayaran','menunggu_konfirmasi_admin')
      );
    end loop;
    v_status := 'menunggu_pembayaran';
  else
    -- Saldo mencukupi seluruh harga job -- tidak ada yang perlu ditransfer.
    v_bank := null;
    v_code := 0;
    v_status := 'berhasil';
  end if;

  insert into escrow_payments
    (job_id, employer_id, worker_id, base_amount, unique_code, total_amount, bank_account_id, status, wallet_deducted, confirmed_at)
  values
    (v_job.id, v_payer_id, v_payee_id, v_remaining, v_code, v_remaining + v_code,
     (case when v_bank.id is not null then v_bank.id else null end), v_status, v_wallet_deduct,
     (case when v_status = 'berhasil' then now() else null end))
  returning id into v_escrow_id;

  -- assigned_worker_id = pihak yang MENGERJAKAN (bisa jadi sama dengan
  -- employer_id kalau ini postingan mencari kerja -- pembuat postingan
  -- itu sendiri yang bekerja). client_id = pihak yang BAYAR & APPROVE.
  update jobs
  set stage = (case when v_status = 'berhasil' then 'dana_diamankan' else 'menunggu_pembayaran' end),
      assigned_worker_id = v_payee_id,
      client_id = v_payer_id,
      paid_at = (case when v_status = 'berhasil' then now() else paid_at end)
  where id = v_job.id;

  update applications set status = 'diterima' where id = p_application_id;
  update applications set status = 'ditolak' where job_id = v_job.id and id <> p_application_id and status = 'menunggu';

  insert into conversations (job_id, employer_id, worker_id)
  values (v_job.id, v_job.employer_id, v_app.worker_id)
  on conflict (job_id, worker_id) do nothing;

  if v_status = 'berhasil' then
    insert into notifications (profile_id, title, body, link, category)
    values (v_payee_id, 'Dana diamankan platform', 'Pembayaran untuk "' || v_job.title || '" lunas otomatis dari saldo ' ||
      (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '. Kamu bisa mulai bekerja sekarang.', '/dashboard/worker', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_payer_id, 'Pembayaran berhasil dari saldo', 'Rp' || v_wallet_deduct || ' otomatis terpotong dari saldo untuk mengamankan "' || v_job.title || '". Dana sudah diamankan platform.', '/dashboard/employer', 'pembayaran');
  else
    insert into notifications (profile_id, title, body, link, category)
    values (v_payee_id, 'Lamaran diterima!', 'Anda diterima untuk "' || v_job.title || '". Menunggu pembayaran dari ' ||
      (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '.', '/dashboard/worker', 'lamaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_payer_id, 'Selesaikan pembayaran', (case when v_wallet_deduct > 0
        then 'Rp' || v_wallet_deduct || ' sudah terpotong dari saldo. Sisa transfer Rp' || (v_remaining + v_code) || ' untuk mengamankan "' || v_job.title || '".'
        else 'Transfer Rp' || (v_remaining + v_code) || ' untuk mengamankan "' || v_job.title || '".'
      end), '/dashboard/employer/escrow/' || v_escrow_id, 'pembayaran');
  end if;

  perform public.write_audit('accept_applicant', 'jobs', v_job.id, jsonb_build_object(
    'application_id', p_application_id, 'escrow_id', v_escrow_id, 'payer_id', v_payer_id, 'payee_id', v_payee_id,
    'wallet_deducted', v_wallet_deduct, 'remaining_transfer', v_remaining));

  return query select v_escrow_id, v_payer_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) admin_action_transaction(): kalau escrow yang dibatalkan admin
--    sempat kepotong saldo (wallet_deducted > 0), kembalikan ke pembayar
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
      if v_escrow.wallet_deducted > 0 then
        update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
        insert into transactions (profile_id, job_id, type, amount, status, note)
        values (v_escrow.employer_id, v_escrow.job_id, 'refund', v_escrow.wallet_deducted, 'berhasil',
          'Pengembalian saldo karena pembayaran escrow dibatalkan admin.');
      end if;
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.employer_id, 'Pembayaran job dibatalkan', 'Pembayaran escrow dibatalkan oleh admin, pekerjaan ikut dibatalkan.' ||
        (case when v_escrow.wallet_deducted > 0 then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
        '/dashboard/employer', 'pembayaran');
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

-- ---------------------------------------------------------
-- 4) auto_cancel_expired_transactions(): idem, refund wallet_deducted
--    saat escrow dibatalkan otomatis karena 6 jam tanpa bukti transfer
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
    update jobs set stage = 'dibatalkan' where id = v_row.job_id and stage in ('menunggu_pembayaran', 'diterima');
    if v_row.wallet_deducted > 0 then
      update profiles set wallet_balance = wallet_balance + v_row.wallet_deducted where id = v_row.employer_id;
      insert into transactions (profile_id, job_id, type, amount, status, note)
      values (v_row.employer_id, v_row.job_id, 'refund', v_row.wallet_deducted, 'berhasil',
        'Pengembalian saldo karena pembayaran escrow dibatalkan otomatis (6 jam tanpa bukti transfer).');
    end if;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.employer_id, 'Pembayaran job dibatalkan otomatis', 'Pembayaran job dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.' ||
      (case when v_row.wallet_deducted > 0 then ' Saldo Rp' || v_row.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
      '/dashboard/employer', 'pembayaran');
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
  -- auto-cancel, karena user tidak perlu upload bukti apa pun --
  -- yang ditunggu justru admin yang memproses transfer.
end;
$$ language plpgsql security definer;

grant execute on function public.auto_cancel_expired_transactions() to authenticated;

-- ---------------------------------------------------------
-- 5) get_all_transactions_admin() & get_my_transactions(): ikut
--    tampilkan baris 'bayar_kerja' (potongan saldo otomatis) dan
--    'refund' (pengembalian saldo) dari tabel transactions -- baris
--    ini TIDAK menduplikasi baris 'escrow_payment' yang sudah ada
--    (itu mewakili sisa yang ditransfer manual / status transfer bank),
--    baris baru ini murni catatan potongan/pengembalian saldo dompet.
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
  where t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund')

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
  where t.profile_id = v_uid and t.type in ('deposit', 'penarikan', 'bayar_kerja', 'refund')

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
