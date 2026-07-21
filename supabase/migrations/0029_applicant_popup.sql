-- =========================================================
-- KERJAHUB — MIGRATION 0029: POPUP PELAMAR BARU
-- Jalankan SETELAH 0028.
--
-- Fitur: saat ada pelamar baru masuk ke postingan seseorang -- baik
-- lowongan kerja biasa (posted_by_role = 'employer') MAUPUN postingan
-- jasa/mencari kerja (posted_by_role = 'worker') -- pembuat postingan
-- (jobs.employer_id) akan melihat popup begitu membuka/refresh app,
-- berisi profil pelamar + tombol Terima/Tolak.
--
-- Isi migration ini:
-- 1) applications.seen_by_poster -- flag supaya popup yang sudah
--    dilihat/ditutup tidak terus muncul berulang untuk pelamar yang
--    sama (popup lanjut ke pelamar berikutnya yang belum dilihat).
-- 2) get_pending_applicant_popup() -- ambil SATU pelamar (paling lama
--    menunggu) yang belum dilihat, untuk postingan milik pengguna yang
--    login, lengkap dengan profil pelamarnya.
-- 3) dismiss_applicant_popup(p_application_id) -- tandai sudah dilihat
--    tanpa mengambil keputusan (popup lanjut ke pelamar berikutnya,
--    tapi pelamar ini tetap ada & bisa diproses dari halaman Pelamar).
-- 4) reject_applicant(p_application_id) -- fungsi baru untuk tombol
--    "Tolak Pelamar" (sebelumnya cuma ada accept_applicant).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom baru
-- ---------------------------------------------------------
alter table applications add column if not exists seen_by_poster boolean not null default false;

-- ---------------------------------------------------------
-- 2) get_pending_applicant_popup(): satu pelamar tertua yang belum
--    dilihat, untuk salah satu postingan milik pengguna yang login
-- ---------------------------------------------------------
create or replace function public.get_pending_applicant_popup()
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  job_price numeric,
  posted_by_role text,
  message text,
  applied_at timestamptz,
  applicant_id uuid,
  applicant_name text,
  applicant_avatar text,
  applicant_bio text,
  applicant_skills text[],
  applicant_kyc_status text,
  applicant_rating_avg numeric,
  applicant_rating_count integer,
  applicant_completed_jobs_count integer
) as $$
  select
    a.id as application_id,
    j.id as job_id,
    j.title as job_title,
    j.price as job_price,
    j.posted_by_role::text as posted_by_role,
    a.message,
    a.created_at as applied_at,
    p.id as applicant_id,
    p.full_name as applicant_name,
    p.avatar_url as applicant_avatar,
    p.bio as applicant_bio,
    p.skills as applicant_skills,
    p.kyc_status::text as applicant_kyc_status,
    p.rating_avg as applicant_rating_avg,
    p.rating_count as applicant_rating_count,
    p.completed_jobs_count as applicant_completed_jobs_count
  from applications a
  join jobs j on j.id = a.job_id
  join profiles p on p.id = a.worker_id
  where j.employer_id = auth.uid()
    and a.status = 'menunggu'
    and a.seen_by_poster = false
    and j.stage = 'terbuka'
  order by a.created_at asc
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_pending_applicant_popup() to authenticated;

-- ---------------------------------------------------------
-- 3) dismiss_applicant_popup(): tutup popup tanpa memutuskan
-- ---------------------------------------------------------
create or replace function public.dismiss_applicant_popup(p_application_id uuid)
returns void as $$
declare
  v_job_employer uuid;
begin
  select j.employer_id into v_job_employer
  from applications a join jobs j on j.id = a.job_id
  where a.id = p_application_id;

  if v_job_employer is null then raise exception 'Lamaran tidak ditemukan'; end if;
  if v_job_employer <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update applications set seen_by_poster = true where id = p_application_id;
end;
$$ language plpgsql security definer;

grant execute on function public.dismiss_applicant_popup(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4) reject_applicant(): tombol "Tolak Pelamar"
-- ---------------------------------------------------------
create or replace function public.reject_applicant(p_application_id uuid)
returns void as $$
declare
  v_app applications%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_app from applications where id = p_application_id for update;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;

  select * into v_job from jobs where id = v_app.job_id;
  if v_job.employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_app.status <> 'menunggu' then raise exception 'Lamaran ini sudah diproses'; end if;

  update applications set status = 'ditolak', seen_by_poster = true where id = p_application_id;

  insert into notifications (profile_id, title, body, link, category)
  values (v_app.worker_id, 'Lamaran ditolak', 'Lamaran kamu untuk "' || v_job.title || '" tidak diterima kali ini.', '/marketplace', 'lamaran');

  perform public.write_audit('reject_applicant', 'applications', p_application_id, jsonb_build_object('job_id', v_job.id));
end;
$$ language plpgsql security definer;

grant execute on function public.reject_applicant(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5) accept_applicant() & submit_escrow_proof dkk sudah menandai
--    applications.status keluar dari 'menunggu' saat diterima, jadi
--    otomatis tidak lagi kena filter popup di atas -- tidak perlu
--    ubah apa pun di fungsi accept_applicant().
-- =========================================================
