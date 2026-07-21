-- =========================================================
-- KERJAHUB — MIGRATION 0031: POPUP "PEKERJAAN SELESAI, HAPUS ATAU
-- TETAP DIPOSTING?"
-- Jalankan SETELAH 0001-0030.
--
-- Fitur: begitu sebuah pekerjaan terkonfirmasi selesai (approve_completion
-- sukses, stage jadi 'selesai' & upah sudah cair), PEMOSTING listing
-- tersebut (jobs.employer_id -- pemilik postingan, baik lowongan kerja
-- posted_by_role = 'employer' MAUPUN postingan jasa/mencari kerja
-- posted_by_role = 'worker') akan melihat popup otomatis saat membuka/
-- refresh app: pekerjaan telah selesai (+ info upah bila pemosting yang
-- menerimanya), dengan 2 pilihan -- "Hapus Postingan" atau "Tetap
-- Diposting".
--
-- CATATAN PERAN (lihat 0025 untuk detail lengkap): jobs.employer_id
-- SELALU pemilik postingan, tapi TIDAK selalu penerima upah --
--   - posted_by_role = 'employer' (lowongan kerja): employer_id = pihak
--     yang MEMBAYAR, upah masuk ke pelamar (assigned_worker_id).
--   - posted_by_role = 'worker' (mencari kerja/jasa): employer_id =
--     pekerja itu sendiri (assigned_worker_id = employer_id), upah
--     masuk ke DOMPETNYA sendiri.
-- Popup ini menyesuaikan kalimatnya sesuai kondisi tsb supaya tidak
-- salah klaim "upah diterima" untuk pemosting lowongan kerja biasa yang
-- justru membayar, bukan menerima.
--
-- Karena job yang sudah 'selesai' punya baris transactions yang me-
-- reference jobs.id TANPA on delete cascade, baris job seperti ini
-- TIDAK BISA dihapus permanen (bakal kena FK violation, lihat
-- JobPostingActions.tsx). Maka "Hapus Postingan" di sini = SOFT DELETE
-- (removed_by_poster = true, is_active = false): postingan hilang dari
-- daftar "Postingan Saya" pemosting & dari mana pun ia biasa muncul,
-- tapi baris & riwayat transaksinya tetap utuh untuk audit/keuangan.
--
-- Isi migration ini:
-- 1) jobs.finish_popup_seen & jobs.removed_by_poster -- kolom baru.
-- 2) approve_completion() -- direfresh supaya reset finish_popup_seen
--    setiap kali sebuah job baru saja disetujui selesai.
-- 3) get_pending_finish_popup() -- ambil SATU job 'selesai' milik
--    pemosting yang login & belum pernah dilihat popup-nya.
-- 4) keep_job_posting(p_job_id) -- pilihan "Tetap Diposting".
-- 5) remove_job_posting(p_job_id) -- pilihan "Hapus Postingan" (soft
--    delete). Juga dipakai ulang oleh tombol "Hapus" manual di
--    JobPostingActions untuk job yang stage-nya sudah 'selesai'.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom baru
-- ---------------------------------------------------------
alter table jobs add column if not exists finish_popup_seen boolean not null default false;
alter table jobs add column if not exists removed_by_poster boolean not null default false;

-- Backfill: job yang sudah 'selesai' SEBELUM migration ini jangan
-- mendadak memunculkan popup untuk semua pengguna lama sekaligus.
update jobs set finish_popup_seen = true where stage = 'selesai' and finish_popup_seen = false;

-- ---------------------------------------------------------
-- 2) approve_completion(): sama seperti versi 0028, ditambah reset
--    finish_popup_seen supaya popup baru ini muncul untuk penyelesaian
--    yang baru terjadi setelah migration ini berjalan.
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
  values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_upah_bersih, 'berhasil',
    'Kamu berhasil menyelesaikan pekerjaan "' || v_job.title || '" dengan upah Rp' || v_job.price ||
    ', belum termasuk biaya fee ' || v_fee_percent || '% platform.');
  insert into transactions (profile_id, job_id, type, amount, status, note)
  values (v_job.assigned_worker_id, v_job.id, 'komisi_platform', v_komisi, 'berhasil', 'Komisi platform untuk: ' || v_job.title);

  update jobs set stage = 'selesai', completed_at = now(), finish_popup_seen = false where id = p_job_id;

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
-- 3) get_pending_finish_popup(): satu job 'selesai' tertua milik
--    pemosting yang login & belum pernah dilihat popup-nya
-- ---------------------------------------------------------
create or replace function public.get_pending_finish_popup()
returns table (
  job_id uuid,
  job_title text,
  category text,
  posted_by_role text,
  price numeric,
  completed_at timestamptz,
  poster_received_wage boolean,
  wage_amount numeric
) as $$
  select
    j.id as job_id,
    j.title as job_title,
    j.category,
    j.posted_by_role::text as posted_by_role,
    j.price,
    j.completed_at,
    (j.posted_by_role = 'worker') as poster_received_wage,
    case when j.posted_by_role = 'worker'
      then round(j.price * (1 - coalesce(public.get_setting_numeric('platform_fee_percent'), 10) / 100), 2)
      else null
    end as wage_amount
  from jobs j
  where j.employer_id = auth.uid()
    and j.stage = 'selesai'
    and j.finish_popup_seen = false
    and j.removed_by_poster = false
  order by j.completed_at asc nulls last
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_pending_finish_popup() to authenticated;

-- ---------------------------------------------------------
-- 4) keep_job_posting(): pilihan "Tetap Diposting" -- cuma menandai
--    popup sudah dilihat, postingan tidak berubah sama sekali.
-- ---------------------------------------------------------
create or replace function public.keep_job_posting(p_job_id uuid)
returns void as $$
declare
  v_owner uuid;
begin
  select employer_id into v_owner from jobs where id = p_job_id;
  if v_owner is null then raise exception 'Postingan tidak ditemukan'; end if;
  if v_owner <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update jobs set finish_popup_seen = true where id = p_job_id;
end;
$$ language plpgsql security definer;

grant execute on function public.keep_job_posting(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5) remove_job_posting(): pilihan "Hapus Postingan" -- soft delete
--    (lihat catatan FK di atas soal kenapa bukan delete permanen).
-- ---------------------------------------------------------
create or replace function public.remove_job_posting(p_job_id uuid)
returns void as $$
declare
  v_owner uuid;
begin
  select employer_id into v_owner from jobs where id = p_job_id;
  if v_owner is null then raise exception 'Postingan tidak ditemukan'; end if;
  if v_owner <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update jobs
    set removed_by_poster = true,
        finish_popup_seen = true,
        is_active = false
    where id = p_job_id;

  perform public.write_audit('remove_job_posting', 'jobs', p_job_id, '{}'::jsonb);
end;
$$ language plpgsql security definer;

grant execute on function public.remove_job_posting(uuid) to authenticated;
