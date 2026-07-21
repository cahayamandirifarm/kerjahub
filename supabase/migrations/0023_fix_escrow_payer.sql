-- =========================================================
-- KERJAHUB — MIGRATION 0023: FIX PEMBAYAR ESCROW
-- Jalankan SETELAH 0001-0022.
--
-- BUG: accept_applicant() selalu mengasumsikan pembuat postingan
-- (jobs.employer_id) adalah pihak yang WAJIB membayar escrow. Ini
-- benar untuk lowongan kerja biasa (posted_by_role = 'employer'),
-- tapi SALAH untuk postingan jasa/mencari kerja (posted_by_role =
-- 'worker') — di kasus itu, jobs.employer_id justru pekerja yang
-- MENAWARKAN jasanya, dan yang seharusnya bayar adalah user yang
-- melamar/tertarik memakai jasa tsb (applications.worker_id).
--
-- FIX: tentukan payer_id & payee_id secara eksplisit sesuai
-- posted_by_role sebelum membuat baris escrow_payments, supaya
-- submit_escrow_proof() (yang mengecek auth.uid() = escrow.employer_id)
-- otomatis mengizinkan pihak yang benar untuk membayar.
-- =========================================================

drop function if exists public.accept_applicant(uuid);

create function public.accept_applicant(p_application_id uuid)
returns uuid as $$
declare
  v_job jobs%rowtype;
  v_app applications%rowtype;
  v_code integer;
  v_bank bank_accounts%rowtype;
  v_escrow_id uuid;
  v_payer_id uuid;   -- pihak yang WAJIB transfer ke escrow
  v_payee_id uuid;   -- pihak yang mengerjakan & menerima dana
begin
  select * into v_app from applications where id = p_application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;

  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  select * into v_job from jobs where id = v_app.job_id for update;
  if v_job.stage <> 'terbuka' then raise exception 'Pekerjaan sudah tidak terbuka'; end if;

  -- Tentukan siapa pembayar & siapa yang mengerjakan, sesuai jenis postingan.
  if v_job.posted_by_role = 'worker' then
    -- Postingan jasa (pekerja menawarkan skill): pelamar = klien yang
    -- tertarik & WAJIB bayar. Pembuat postingan = pekerja yang mengerjakan.
    v_payer_id := v_app.worker_id;
    v_payee_id := v_job.employer_id;
  else
    -- Lowongan kerja biasa: pembuat postingan (employer) yang bayar,
    -- pelamar yang mengerjakan. Perilaku lama, tidak berubah.
    v_payer_id := v_job.employer_id;
    v_payee_id := v_app.worker_id;
  end if;

  select * into v_bank from bank_accounts where is_active = true order by created_at limit 1;

  -- generate kode unik 3 digit yang belum dipakai di escrow yang masih menunggu
  loop
    v_code := floor(random() * 900 + 100)::integer;
    exit when not exists (
      select 1 from escrow_payments
      where unique_code = v_code and status in ('menunggu_pembayaran','menunggu_konfirmasi_admin')
    );
  end loop;

  -- CATATAN: kolom escrow_payments.employer_id/worker_id di sini dipakai
  -- sebagai payer_id/payee_id (bukan selalu sama dengan jobs.employer_id/
  -- assigned_worker_id) — supaya submit_escrow_proof() & seluruh RLS yang
  -- mengecek "auth.uid() = employer_id or auth.uid() = worker_id" otomatis
  -- mengizinkan pihak yang benar-benar terlibat, di kedua jenis postingan.
  insert into escrow_payments (job_id, employer_id, worker_id, base_amount, unique_code, total_amount, bank_account_id, status)
  values (v_job.id, v_payer_id, v_payee_id, v_job.price, v_code, v_job.price + v_code, v_bank.id, 'menunggu_pembayaran')
  returning id into v_escrow_id;

  update jobs set stage = 'menunggu_pembayaran', assigned_worker_id = v_app.worker_id where id = v_job.id;
  update applications set status = 'diterima' where id = p_application_id;
  update applications set status = 'ditolak' where job_id = v_job.id and id <> p_application_id and status = 'menunggu';

  insert into conversations (job_id, employer_id, worker_id)
  values (v_job.id, v_job.employer_id, v_app.worker_id)
  on conflict (job_id, worker_id) do nothing;

  insert into notifications (profile_id, title, body, link, category)
  values (v_payee_id, 'Lamaran diterima!', 'Anda diterima untuk "' || v_job.title || '". Menunggu pembayaran dari ' ||
    (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '.', '/dashboard/worker', 'lamaran');
  insert into notifications (profile_id, title, body, link, category)
  values (v_payer_id, 'Selesaikan pembayaran', 'Transfer Rp' || (v_job.price + v_code) || ' untuk mengamankan "' || v_job.title || '".', '/dashboard/employer/escrow/' || v_escrow_id, 'pembayaran');

  perform public.write_audit('accept_applicant', 'jobs', v_job.id, jsonb_build_object('application_id', p_application_id, 'escrow_id', v_escrow_id, 'payer_id', v_payer_id));

  return v_escrow_id;
end;
$$ language plpgsql security definer;
