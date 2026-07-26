-- =========================================================
-- KERJAHUB — MIGRATION 0080: PERBAIKAN BUG SEBENARNYA -- POPUP
-- PENOLAKAN FILTER KATA TIDAK PERNAH MUNCUL SEJAK AWAL (0065)
--
-- AKAR MASALAH (dikonfirmasi lewat tes langsung di SQL Editor):
-- check_job_moderation()/check_listing_moderation() adalah trigger
-- BEFORE INSERT -- artinya baris job/listing itu BELUM benar-benar ada
-- di tabel jobs/digital_listings saat trigger ini jalan. Tapi kode
-- lama mencoba:
--   insert into moderation_flags (..., job_id, ...) values (..., new.id, ...)
-- Karena moderation_flags.job_id adalah FOREIGN KEY ke jobs(id), insert
-- ini SELALU GAGAL dengan error "violates foreign key constraint
-- moderation_flags_job_id_fkey" (kode error 23503) -- SEBELUM sempat
-- sampai ke baris `raise exception` yang berisi pesan popup penolakan.
--
-- Akibatnya kode error yang diterima frontend SELALU 23503, bukan
-- P0001 -- jadi JobForm.tsx/ListingForm.tsx (yang cuma mengenali
-- errcode P0001 sebagai "tampilkan sebagai popup") selalu jatuh ke
-- pesan generik "Gagal memasang penawaran/produk. Coba lagi." Ini bug
-- sejak migration 0065 pertama kali dibuat, TIDAK ADA HUBUNGANNYA
-- dengan kata kunci yang dites atau proses deploy.
--
-- CATATAN TAMBAHAN: sekalipun FK ini diperbaiki, baris log ke
-- moderation_flags tetap TIDAK AKAN pernah tersimpan permanen --
-- `raise exception` setelahnya membatalkan (rollback) SELURUH transaksi
-- yang sama, termasuk insert log itu sendiri. Jadi desain "catat log
-- lalu tolak" di trigger yang sama memang tidak bisa jalan tanpa
-- autonomous transaction (mis. lewat extension dblink) -- di luar
-- cakupan fix ini. Untuk sekarang, baris insert ke moderation_flags
-- DIHAPUS dari trigger (karena toh tidak pernah tersimpan & inilah
-- yang menyebabkan bug), supaya trigger fokus reject + tampilkan pesan
-- yang benar ke user.
-- =========================================================

create or replace function public.check_job_moderation()
returns trigger as $$
declare
  v_hit record;
  v_label text;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    v_label := case v_hit.matched_category
      when 'dating_dewasa' then 'Dating Online / Konten Dewasa'
      when 'scam' then 'Penipuan (Scam)'
      when 'curhat_teman' then 'Jasa Teman/Curhat Berbayar'
      else 'konten yang dilarang platform'
    end;

    raise exception 'Ditolak oleh sistem — postingan terindikasi mengandung konten % dan sejenisnya. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.', v_label
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.check_listing_moderation()
returns trigger as $$
declare
  v_hit record;
  v_label text;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    v_label := case v_hit.matched_category
      when 'dating_dewasa' then 'Dating Online / Konten Dewasa'
      when 'scam' then 'Penipuan (Scam)'
      when 'curhat_teman' then 'Jasa Teman/Curhat Berbayar'
      else 'konten yang dilarang platform'
    end;

    raise exception 'Ditolak oleh sistem — produk terindikasi mengandung konten % dan sejenisnya. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.', v_label
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

-- Pastikan trigger-nya memang terpasang & menunjuk ke function di atas.
drop trigger if exists trg_check_job_moderation on jobs;
create trigger trg_check_job_moderation
  before insert or update of title, description on jobs
  for each row execute function public.check_job_moderation();

drop trigger if exists trg_check_listing_moderation on digital_listings;
create trigger trg_check_listing_moderation
  before insert or update of title, description on digital_listings
  for each row execute function public.check_listing_moderation();

-- ---------------------------------------------------------
-- VERIFIKASI (jalankan terpisah setelah migration ini, aman -- dibungkus
-- transaksi & di-ROLLBACK, jadi TIDAK membuat postingan baru sungguhan):
--
-- begin;
-- insert into jobs (employer_id, posted_by_role, title, category, description, location, price, estimated_duration)
-- values ((select id from profiles limit 1), 'employer', 'TES FILTER MODERASI', 'Lainnya',
--         'ini tes trigger, mengandung kata sugar baby', 'Jakarta', 100000, '1 hari');
-- rollback;
--
-- Harusnya sekarang keluar error "Ditolak oleh sistem — postingan
-- terindikasi mengandung konten Dating Online / Konten Dewasa dan
-- sejenisnya..." (bukan lagi error foreign key).
-- ---------------------------------------------------------
