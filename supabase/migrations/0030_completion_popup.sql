-- =========================================================
-- KERJAHUB — MIGRATION 0030: POPUP KONFIRMASI PEKERJAAN SELESAI
-- Jalankan SETELAH 0001-0029.
--
-- Fitur: begitu pekerja menekan "Tandai Selesai" (submit_job_completion,
-- stage jadi 'menunggu_konfirmasi_selesai'), pihak klien (jobs.client_id
-- -- yaitu pihak yang membayar & berhak approve) akan langsung melihat
-- popup otomatis saat membuka/refresh app, berisi ringkasan pekerjaan +
-- foto hasil kerja + form rating, dengan tombol Setujui / Minta Revisi
-- -- tanpa perlu navigasi manual ke halaman detail job dulu.
--
-- Pola sama persis dengan popup pelamar (0029): pakai flag "sudah
-- dilihat" supaya popup yang sudah ditutup tidak muncul berulang, dan
-- otomatis reset kalau pekerjaan disubmit ulang setelah revisi.
--
-- Isi migration ini:
-- 1) jobs.completion_seen_by_client -- flag popup sudah dilihat/ditutup.
-- 2) submit_job_completion() -- direfresh supaya reset flag di atas
--    setiap kali disubmit (termasuk submit ulang setelah revisi).
-- 3) get_pending_completion_popup() -- ambil SATU job yang menunggu
--    konfirmasi client yang login, lengkap profil pekerja + foto hasil.
-- 4) dismiss_completion_popup(p_job_id) -- tandai sudah dilihat tanpa
--    mengambil keputusan (job tetap bisa diproses dari halaman detail).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom baru
-- ---------------------------------------------------------
alter table jobs add column if not exists completion_seen_by_client boolean not null default false;

-- ---------------------------------------------------------
-- 2) submit_job_completion(): sama seperti versi 0025, ditambah reset
--    completion_seen_by_client supaya popup muncul lagi kalau ini
--    submit ulang setelah revisi.
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

  update jobs set stage = 'menunggu_konfirmasi_selesai', completion_seen_by_client = false where id = p_job_id;
  insert into notifications (profile_id, title, body, link, category)
  values (v_job.client_id, 'Pekerjaan selesai dikerjakan', '"' || v_job.title || '" menunggu konfirmasi kamu.', '/dashboard/employer', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) get_pending_completion_popup(): satu job tertua yang menunggu
--    konfirmasi client yang login & belum pernah dilihat popup-nya
-- ---------------------------------------------------------
create or replace function public.get_pending_completion_popup()
returns table (
  job_id uuid,
  job_title text,
  job_price numeric,
  category text,
  worker_id uuid,
  worker_name text,
  worker_avatar text,
  worker_kyc_status text,
  worker_rating_avg numeric,
  worker_rating_count integer,
  worker_completed_jobs_count integer,
  photo_urls text[],
  conversation_id uuid
) as $$
  select
    j.id as job_id,
    j.title as job_title,
    j.price as job_price,
    j.category,
    p.id as worker_id,
    p.full_name as worker_name,
    p.avatar_url as worker_avatar,
    p.kyc_status::text as worker_kyc_status,
    p.rating_avg as worker_rating_avg,
    p.rating_count as worker_rating_count,
    p.completed_jobs_count as worker_completed_jobs_count,
    coalesce(
      (select array_agg(jp.url order by jp.created_at) from job_photos jp where jp.job_id = j.id),
      array[]::text[]
    ) as photo_urls,
    c.id as conversation_id
  from jobs j
  join profiles p on p.id = j.assigned_worker_id
  left join conversations c on c.job_id = j.id and c.source_type = 'job'
  where j.client_id = auth.uid()
    and j.stage = 'menunggu_konfirmasi_selesai'
    and j.completion_seen_by_client = false
  order by j.created_at asc
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_pending_completion_popup() to authenticated;

-- ---------------------------------------------------------
-- 4) dismiss_completion_popup(): tutup popup tanpa memutuskan
-- ---------------------------------------------------------
create or replace function public.dismiss_completion_popup(p_job_id uuid)
returns void as $$
declare
  v_client uuid;
begin
  select client_id into v_client from jobs where id = p_job_id;
  if v_client is null then raise exception 'Pekerjaan tidak ditemukan'; end if;
  if v_client <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update jobs set completion_seen_by_client = true where id = p_job_id;
end;
$$ language plpgsql security definer;

grant execute on function public.dismiss_completion_popup(uuid) to authenticated;
