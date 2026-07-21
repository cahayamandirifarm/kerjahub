-- =========================================================
-- KERJAHUB — MIGRATION 0027: PERBAIKAN ERROR CAST job_stage
-- Jalankan SETELAH 0026.
--
-- BUG: migration 0026 (accept_applicant) meng-update kolom
-- jobs.stage (tipe enum job_stage) memakai ekspresi
-- `CASE WHEN ... THEN 'dana_diamankan' ELSE 'menunggu_pembayaran' END`
-- TANPA cast eksplisit. Postgres tidak bisa otomatis menyimpulkan
-- tipe hasil CASE tsb sebagai job_stage (beda dgn assignment literal
-- tunggal yang otomatis di-cast), sehingga muncul error saat admin
-- menerima lamaran:
--   "column "stage" is of type job_stage but expression is of type text"
--
-- FIX: tambahkan ::job_stage pada hasil CASE tsb. Migration ini
-- cukup mendefinisikan ulang accept_applicant() dengan perbaikan itu,
-- sisanya identik dengan versi di 0026.
-- =========================================================

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
  set stage = (case when v_status = 'berhasil' then 'dana_diamankan' else 'menunggu_pembayaran' end)::job_stage,
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
