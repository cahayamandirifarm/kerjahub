-- ---------------------------------------------------------
-- Kolom `updated_at` di tabel `jobs` + trigger auto-update.
--
-- KENAPA: beranda (app/page.tsx) butuh cara murah untuk tahu "ada postingan
-- baru/berubah atau tidak" tanpa harus query ulang daftar penuh tiap saat.
-- Endpoint /api/jobs/latest-marker akan mengembalikan id+waktu postingan
-- TERBARU (created_at) dan id+waktu postingan yang TERAKHIR DIUBAH
-- (updated_at) -- device pengguna menyimpan 2 nilai ini
-- (latestPostId & latestUpdateId) di local cache, lalu polling ringan
-- membandingkan nilai itu ke server. Kalau beda, baru trigger refresh
-- data asli (yang sudah di-cache lewat unstable_cache) -- jadi terasa
-- realtime tanpa bikin setiap pengguna query tabel jobs secara penuh
-- berulang-ulang.
-- ---------------------------------------------------------

alter table jobs add column if not exists updated_at timestamptz not null default now();

-- Backfill baris lama supaya updated_at tidak null/kosong secara historis.
update jobs set updated_at = created_at where updated_at is null;

create or replace function public.set_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_jobs_updated_at on jobs;
create trigger trg_jobs_updated_at
  before update on jobs
  for each row
  execute function public.set_jobs_updated_at();

create index if not exists jobs_updated_at_idx on jobs(updated_at);
