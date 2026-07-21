-- =========================================================
-- KERJAHUB — MIGRATION 0022: ACTIVE JOB LOCK POPUP
-- Jalankan SETELAH 0001-0021.
--
-- Tujuan: begitu pembayaran sebuah job/jasa DIKONFIRMASI (stage masuk
-- fase aktif: dana_diamankan / dikerjakan / menunggu_konfirmasi_selesai
-- / revisi), employer & worker yang terlibat akan melihat pop up
-- mengambang WAJIB (tidak bisa ditutup, mengunci menu lain) sampai
-- job itu berstatus 'selesai' atau 'dibatalkan'. Selama terkunci, yang
-- boleh diakses hanya: pop up itu sendiri, halaman chat percakapan job
-- tsb, dan halaman kelola/status job tsb (tempat submit/approve
-- pekerjaan) — supaya job tetap bisa diselesaikan.
--
-- Asumsi bisnis (dikonfirmasi user): 1 user hanya boleh punya 1 job
-- aktif dalam satu waktu, jadi RPC ini cukup mengambil satu baris.
-- =========================================================

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
    case when j.employer_id = auth.uid() then 'employer' else 'worker' end as my_role,
    case when j.employer_id = auth.uid() then j.assigned_worker_id else j.employer_id end as other_id,
    op.full_name as other_name,
    op.avatar_url as other_avatar,
    op.phone as other_phone,
    c.id as conversation_id,
    j.paid_at
  from jobs j
  left join profiles op
    on op.id = (case when j.employer_id = auth.uid() then j.assigned_worker_id else j.employer_id end)
  left join conversations c
    on c.job_id = j.id and c.employer_id = j.employer_id and c.worker_id = j.assigned_worker_id
  where (j.employer_id = auth.uid() or j.assigned_worker_id = auth.uid())
    and j.stage in ('dana_diamankan', 'dikerjakan', 'menunggu_konfirmasi_selesai', 'revisi')
  order by j.paid_at desc nulls last
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_my_active_job() to authenticated;

-- pastikan perubahan stage job ikut disiarkan lewat Realtime, supaya
-- pop up otomatis muncul/hilang tanpa perlu reload halaman
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'jobs') then
    alter publication supabase_realtime add table jobs;
  end if;
end $$;
