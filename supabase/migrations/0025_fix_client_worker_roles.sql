-- =========================================================
-- KERJAHUB — MIGRATION 0025: FIX PERAN "MULAI BEKERJA" & PENERIMA UPAH
-- Jalankan SETELAH 0001-0024.
--
-- BUG LANJUTAN dari 0023/0024: migration itu sudah membenahi SIAPA yang
-- wajib membayar escrow (payer_id/payee_id), tapi tidak membenahi
-- jobs.assigned_worker_id -- kolom ini masih SELALU diisi dengan
-- applications.worker_id (si pelamar), padahal:
--
--   - Lowongan kerja biasa (posted_by_role = 'employer'):
--     pelamar = pekerja yang mengerjakan & menerima upah. BENAR.
--
--   - Postingan jasa/mencari kerja (posted_by_role = 'worker'):
--     pembuat postingan (jobs.employer_id) = pekerja yang menawarkan
--     jasa & yang SEHARUSNYA mengerjakan + menerima upah. Pelamar
--     (applications.worker_id) justru klien yang tertarik & membayar.
--     assigned_worker_id yang lama SALAH mengarah ke klien tsb.
--
-- Akibatnya, setelah admin_confirm_escrow() sukses:
--   - start_work() & submit_job_completion() mengecek
--     "assigned_worker_id = auth.uid()" -> klien (bukan pekerja) yang
--     bisa pencet "Mulai Bekerja", bukan user yang memposting mencari
--     kerja.
--   - approve_completion() & request_revision() mengecek
--     "jobs.employer_id = auth.uid()" untuk hak approve/minta revisi
--     -> pekerja (pemosting) yang salah dianggap berhak approve,
--     padahal seharusnya klien (pembayar) yang approve.
--   - approve_completion() mencairkan upah ke assigned_worker_id yang
--     salah, jadi upah masuk ke dompet klien, bukan dompet user yang
--     memposting mencari kerja.
--
-- FIX: tambah kolom jobs.client_id (pihak pembayar & yang berhak
-- approve/minta revisi -- setara "employer" secara fungsi, terlepas
-- siapa yang membuat postingan). Isi assigned_worker_id & client_id
-- secara eksplisit sesuai posted_by_role di accept_applicant(), lalu
-- ganti semua pengecekan hak akses dari jobs.employer_id ke
-- jobs.client_id di start_work/submit_job_completion/request_revision/
-- approve_completion/get_my_active_job. jobs.employer_id TIDAK diubah
-- maknanya -- tetap "pembuat postingan", dipakai untuk kepemilikan
-- listing (edit/hapus job), bukan untuk hak escrow/approve.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom baru: pihak pembayar & pemberi approval (client)
-- ---------------------------------------------------------
alter table jobs add column if not exists client_id uuid references profiles(id);

-- Default aman untuk job lama: lowongan kerja biasa memang client = pembuat
-- postingan, jadi ini sudah benar untuk mayoritas data.
update jobs set client_id = employer_id where client_id is null;

-- Perbaiki data job MENCARI KERJA yang MASIH BERJALAN (belum 'selesai'/
-- 'dibatalkan') dan sudah pernah diterima (assigned_worker_id terisi &
-- berbeda dari employer_id, artinya masih memakai penandaan lama yang
-- salah). Aman dikoreksi karena belum ada pencairan upah.
--
-- CATATAN PENTING: job posted_by_role = 'worker' yang SUDAH 'selesai'
-- sengaja TIDAK disentuh di sini -- upah untuk job itu kemungkinan
-- sudah kadung cair ke dompet yang salah (klien, bukan pekerja).
-- Itu perlu koreksi keuangan manual oleh admin (pindahkan saldo &
-- catatan transaksi), bukan sekadar update kolom. Jalankan query di
-- bawah untuk menemukan job yang perlu direview manual:
--
--   select id, title, employer_id, assigned_worker_id, price, completed_at
--   from jobs
--   where posted_by_role = 'worker' and stage = 'selesai'
--     and assigned_worker_id is not null and assigned_worker_id <> employer_id;
update jobs
set client_id = assigned_worker_id,
    assigned_worker_id = employer_id
where posted_by_role = 'worker'
  and assigned_worker_id is not null
  and assigned_worker_id <> employer_id
  and stage not in ('selesai', 'dibatalkan');

-- ---------------------------------------------------------
-- 2) accept_applicant(): isi assigned_worker_id & client_id dengan benar
-- ---------------------------------------------------------
create or replace function public.accept_applicant(p_application_id uuid)
returns table (escrow_id uuid, payer_id uuid) as $$
declare
  v_job jobs%rowtype;
  v_app applications%rowtype;
  v_code integer;
  v_bank bank_accounts%rowtype;
  v_escrow_id uuid;
  v_payer_id uuid;          -- pihak yang WAJIB transfer ke escrow (= client_id)
  v_payee_id uuid;          -- pihak yang mengerjakan & menerima dana (= assigned_worker_id)
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

  select * into v_bank from bank_accounts where is_active = true order by created_at limit 1;

  loop
    v_code := floor(random() * 900 + 100)::integer;
    exit when not exists (
      select 1 from escrow_payments
      where unique_code = v_code and status in ('menunggu_pembayaran','menunggu_konfirmasi_admin')
    );
  end loop;

  insert into escrow_payments (job_id, employer_id, worker_id, base_amount, unique_code, total_amount, bank_account_id, status)
  values (v_job.id, v_payer_id, v_payee_id, v_job.price, v_code, v_job.price + v_code, v_bank.id, 'menunggu_pembayaran')
  returning id into v_escrow_id;

  -- assigned_worker_id = pihak yang MENGERJAKAN (bisa jadi sama dengan
  -- employer_id kalau ini postingan mencari kerja -- pembuat postingan
  -- itu sendiri yang bekerja). client_id = pihak yang BAYAR & APPROVE.
  update jobs
  set stage = 'menunggu_pembayaran', assigned_worker_id = v_payee_id, client_id = v_payer_id
  where id = v_job.id;

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

  perform public.write_audit('accept_applicant', 'jobs', v_job.id, jsonb_build_object('application_id', p_application_id, 'escrow_id', v_escrow_id, 'payer_id', v_payer_id, 'payee_id', v_payee_id));

  return query select v_escrow_id, v_payer_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) start_work(): notifikasi ke client_id, bukan employer_id
--    (pengecekan assigned_worker_id otomatis benar setelah fix #2)
-- ---------------------------------------------------------
create or replace function public.start_work(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.assigned_worker_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage <> 'dana_diamankan' then raise exception 'Pekerjaan belum siap dimulai'; end if;

  update jobs set stage = 'dikerjakan' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.client_id, 'Pekerja mulai bekerja', 'Pekerja telah menekan tombol Mulai Bekerja untuk "' || v_job.title || '".', '/dashboard/employer', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 4) submit_job_completion(): notifikasi ke client_id, bukan employer_id
-- ---------------------------------------------------------
create or replace function public.submit_job_completion(p_job_id uuid)
returns void as $$
declare
  v_job jobs%rowtype;
  v_photo_count integer;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.assigned_worker_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_job.stage not in ('dikerjakan', 'revisi') then raise exception 'Status pekerjaan tidak sesuai'; end if;

  select count(*) into v_photo_count from job_photos where job_id = p_job_id;
  if v_photo_count < 1 then raise exception 'Unggah minimal 1 foto hasil pekerjaan'; end if;

  update jobs set stage = 'menunggu_konfirmasi_selesai' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.client_id, 'Pekerjaan selesai dikerjakan', '"' || v_job.title || '" menunggu konfirmasi kamu.', '/dashboard/employer', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 5) request_revision(): hak minta revisi ada di client_id
-- ---------------------------------------------------------
create or replace function public.request_revision(p_job_id uuid, p_note text)
returns void as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if v_job.client_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update jobs set stage = 'revisi' where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.assigned_worker_id, 'Revisi diminta', coalesce(p_note, 'Klien meminta revisi pekerjaan.'), '/dashboard/worker', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 6) approve_completion(): hak approve & sumber rating ada di client_id;
--    upah tetap cair ke assigned_worker_id (sekarang sudah benar)
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
  values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_upah_bersih, 'berhasil', 'Upah diterima (setelah komisi platform ' || v_fee_percent || '%) untuk: ' || v_job.title);
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
-- 7) job_photos RLS: client_id juga berhak lihat foto hasil kerja
--    (sebelumnya cuma employer_id & assigned_worker_id -- untuk
--    postingan mencari kerja, employer_id = assigned_worker_id,
--    jadi klien pembayar malah tidak kebagian akses)
-- ---------------------------------------------------------
drop policy if exists "Terlibat bisa lihat foto pekerjaan" on job_photos;
create policy "Terlibat bisa lihat foto pekerjaan" on job_photos
  for select using (
    auth.uid() in (select employer_id from jobs where jobs.id = job_photos.job_id)
    or auth.uid() in (select assigned_worker_id from jobs where jobs.id = job_photos.job_id)
    or auth.uid() in (select client_id from jobs where jobs.id = job_photos.job_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------
-- 8) get_my_active_job() (popup job aktif wajib): pakai client_id
--    untuk menentukan peran & lawan bicara, bukan employer_id
-- ---------------------------------------------------------
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
  paid_at timestamptz
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
    j.paid_at
  from jobs j
  left join profiles op
    on op.id = (case when j.client_id = auth.uid() then j.assigned_worker_id else j.client_id end)
  left join conversations c
    on c.job_id = j.id
    and c.employer_id = j.employer_id
    -- lawan bicara di percakapan = pelamar yang diterima. Pelamar itu
    -- selalu pihak yang BUKAN pembuat postingan (j.employer_id) --
    -- yaitu client_id kalau ini postingan mencari kerja (di situ
    -- assigned_worker_id "menumpuk" jadi sama dengan employer_id,
    -- karena pembuat postingan sendiri yang bekerja), atau
    -- assigned_worker_id untuk lowongan kerja biasa. Dibutuhkan supaya
    -- tetap kena persis SATU percakapan (yang diterima), bukan ikut
    -- kebawa percakapan pra-deal pelamar lain yang tidak diterima.
    and c.worker_id = (case when j.assigned_worker_id = j.employer_id then j.client_id else j.assigned_worker_id end)
  where (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    and j.stage in ('dana_diamankan', 'dikerjakan', 'menunggu_konfirmasi_selesai', 'revisi')
  order by j.paid_at desc nulls last
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_my_active_job() to authenticated;
