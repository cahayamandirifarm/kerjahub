-- =========================================================
-- KERJAHUB — MIGRATION 0032: "TETAP DIPOSTING" = BUKA LOWONGAN BARU
-- Jalankan SETELAH 0001-0031.
--
-- FIX dari 0031: semula keep_job_posting() cuma menandai popup sudah
-- dilihat tanpa mengubah apa pun -- job yang sudah 'selesai' TETAP tidak
-- akan muncul lagi di beranda (beranda cuma tampilkan stage = 'terbuka'),
-- padahal maksud tombol "Tetap Diposting" adalah lowongan itu tetap
-- terus terposting sampai user hapus sendiri.
--
-- PENTING: solusinya BUKAN mengembalikan stage baris job yang sudah
-- 'selesai' itu jadi 'terbuka' lagi. Baris itu sudah "kotor" dengan
-- riwayat siklus sebelumnya:
--   - job_photos lama masih nempel -> submit_job_completion() cuma
--     mengecek COUNT(*) job_photos untuk job_id itu, jadi pekerja baru
--     bisa lolos "submit selesai" tanpa upload bukti baru sama sekali.
--   - ratings punya UNIQUE(job_id) -> rating siklus baru akan
--     MENIMPA rating siklus lama, bukan jadi riwayat baru.
--   - conversations & applications lama ikut tercampur dengan siklus
--     baru di job_id yang sama.
--
-- FIX YANG BENAR: "Tetap Diposting" membuat POSTINGAN BARU (baris jobs
-- baru, id baru) dengan detail yang sama persis (judul, kategori,
-- deskripsi, lokasi, harga, dst), stage 'terbuka', siap menerima
-- pelamar baru dari nol. Postingan LAMA yang sudah selesai tidak
-- disentuh sama sekali -- tetap utuh di riwayat/dashboard sebagai bukti
-- pekerjaan yang sudah kelar (foto, rating, transaksi tetap aman).
-- =========================================================

-- Return type fungsi ini berubah dari void (versi 0031) jadi uuid --
-- CREATE OR REPLACE tidak bisa dipakai untuk mengganti return type,
-- jadi drop dulu baris lama sebelum bikin ulang.
drop function if exists public.keep_job_posting(uuid);

create function public.keep_job_posting(p_job_id uuid)
returns uuid as $$
declare
  v_job jobs%rowtype;
  v_new_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then raise exception 'Postingan tidak ditemukan'; end if;
  if v_job.employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  -- Tandai popup pekerjaan lama ini sudah dilihat. Baris lama TIDAK
  -- diubah selain flag ini -- foto/rating/riwayat transaksinya tetap
  -- melekat apa adanya di sini.
  update jobs set finish_popup_seen = true where id = p_job_id;

  insert into jobs (
    employer_id, posted_by_role, title, category, description, location,
    is_remote, price, estimated_duration, latitude, longitude, address,
    radius_km, is_active
  )
  values (
    v_job.employer_id, v_job.posted_by_role, v_job.title, v_job.category, v_job.description, v_job.location,
    v_job.is_remote, v_job.price, v_job.estimated_duration, v_job.latitude, v_job.longitude, v_job.address,
    v_job.radius_km, true
  )
  returning id into v_new_id;

  perform public.write_audit('repost_job', 'jobs', v_new_id, jsonb_build_object('cloned_from', p_job_id));

  return v_new_id;
end;
$$ language plpgsql security definer;

grant execute on function public.keep_job_posting(uuid) to authenticated;
