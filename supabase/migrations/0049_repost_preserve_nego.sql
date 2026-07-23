-- =========================================================
-- KERJAHUB — MIGRATION 0049: "TETAP DIPOSTING" PERTAHANKAN HARGA NEGO
-- Jalankan SETELAH 0001-0048.
--
-- BUG: keep_job_posting() (migrasi 0032) dibuat SEBELUM kolom is_nego
-- ada (migrasi 0048), jadi kolom itu tidak pernah ikut disalin waktu
-- "Tetap Diposting" -> job baru hasil clone SELALU is_nego = false
-- (nilai default kolom), walaupun postingan asalnya dipasang sebagai
-- harga nego.
--
-- Masalahnya TIDAK BISA diselesaikan cuma dengan menyalin
-- v_job.is_nego apa adanya: begitu tawaran nego DISEPAKATI
-- (accept_nego_offer, migrasi 0048), baris job yang sama langsung
-- di-flip is_nego = false dan price ditimpa jadi harga akhir hasil
-- nego -- jadi baris job yang sudah 'selesai' itu is_nego-nya memang
-- sudah false, bukan mencerminkan niat awal postingan.
--
-- FIX: deteksi "aslinya nego atau bukan" dari histori nego_offers milik
-- job ini (ada tawaran yang pernah 'diterima' = aslinya nego). Kalau
-- iya, job hasil repost dibuat is_nego = true lagi (kembali ke mode
-- nego, siap dinego ulang dari nol) -- harga transaksi terakhir dipakai
-- cuma sebagai perkiraan harga awal, BUKAN harga final baru.
-- =========================================================

create or replace function public.keep_job_posting(p_job_id uuid)
returns uuid as $$
declare
  v_job jobs%rowtype;
  v_new_id uuid;
  v_was_nego boolean;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then raise exception 'Postingan tidak ditemukan'; end if;
  if v_job.employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  -- Tandai popup pekerjaan lama ini sudah dilihat. Baris lama TIDAK
  -- diubah selain flag ini -- foto/rating/riwayat transaksinya tetap
  -- melekat apa adanya di sini.
  update jobs set finish_popup_seen = true where id = p_job_id;

  select exists (
    select 1 from nego_offers no where no.job_id = p_job_id and no.status = 'diterima'
  ) into v_was_nego;

  insert into jobs (
    employer_id, posted_by_role, title, category, description, location,
    is_remote, price, estimated_duration, latitude, longitude, address,
    radius_km, is_active, is_nego
  )
  values (
    v_job.employer_id, v_job.posted_by_role, v_job.title, v_job.category, v_job.description, v_job.location,
    v_job.is_remote, v_job.price, v_job.estimated_duration, v_job.latitude, v_job.longitude, v_job.address,
    v_job.radius_km, true, coalesce(v_was_nego, v_job.is_nego, false)
  )
  returning id into v_new_id;

  perform public.write_audit('repost_job', 'jobs', v_new_id, jsonb_build_object('cloned_from', p_job_id));

  return v_new_id;
end;
$$ language plpgsql security definer;

grant execute on function public.keep_job_posting(uuid) to authenticated;
