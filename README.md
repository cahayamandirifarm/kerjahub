# Fix: peran client/worker untuk postingan mencari kerja

Isi paket ini:

- `supabase/migrations/0025_fix_client_worker_roles.sql` (BARU)
  Menambah kolom `jobs.client_id` dan memperbaiki `accept_applicant`,
  `start_work`, `submit_job_completion`, `request_revision`,
  `approve_completion`, RLS `job_photos`, dan `get_my_active_job`
  supaya untuk postingan mencari kerja (`posted_by_role = 'worker'`):
  user yang MEMPOSTING mencari kerja yang bisa mulai bekerja & yang
  menerima upah, bukan pelamar/klien.

- `app/dashboard/employer/applicants/[jobId]/AcceptButton.tsx`
  `app/dashboard/employer/escrow/[escrowId]/page.tsx`
  (Sudah dari fix sebelumnya — payer escrow yang benar. Disertakan
  lagi di sini supaya paket ini lengkap/siap timpa langsung ke repo.)

## Cara pakai

1. Salin/timpa ketiga file di atas ke repo git project kamu, di path
   yang sama persis.
2. `git add . && git commit -m "fix: peran client/worker mencari kerja" && git push`
3. Jalankan migration ke Supabase: `supabase db push`
   (atau paste isi file .sql ke Supabase Dashboard → SQL Editor → Run)

Lihat komentar di dalam file migration untuk detail bug & query
manual-review untuk job yang sudah 'selesai' sebelum fix ini
(kemungkinan upahnya sudah kadung cair ke dompet yang salah).
