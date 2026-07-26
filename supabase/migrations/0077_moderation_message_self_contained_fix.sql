-- =========================================================
-- KERJAHUB — MIGRATION 0077: PERBAIKAN PESAN PENOLAKAN FILTER KATA
-- (versi self-contained, gantikan 0076)
-- Jalankan SETELAH 0001-0075. Kalau 0076 sudah pernah dijalankan
-- sebagian/lengkap, tidak masalah -- semua perintah di sini
-- `create or replace`, aman dijalankan ulang berapa kali pun.
--
-- KENAPA ADA MIGRATION INI: di 0076, teks kategori diambil lewat
-- function terpisah public.moderation_category_label(). Kalau function
-- itu gagal ke-buat (mis. cuma sebagian query di 0076 yang sempat
-- dijalankan di SQL Editor), trigger check_job_moderation() /
-- check_listing_moderation() yang memanggilnya akan error "function
-- does not exist" -- errcode BUKAN 'P0001', jadi frontend tidak
-- mengenalinya dan malah nampilin pesan default
-- "Gagal memasang penawaran/tawaran. Coba lagi." alih-alih pesan
-- penolakan yang seharusnya.
--
-- Supaya tidak ada lagi risiko "setengah jalan" seperti itu, di sini
-- logika kategori di-inline LANGSUNG ke masing-masing trigger function
-- (tidak manggil function terpisah lagi) -- SATU query CREATE OR
-- REPLACE per trigger, tidak ada dependency antar function.
--
-- CARA JALANKAN YANG BENAR: copy SELURUH isi file ini, paste ke
-- Supabase SQL Editor, lalu klik Run SATU KALI untuk semuanya
-- sekaligus (jangan select sebagian baris lalu run terpisah-pisah).
-- =========================================================

create or replace function public.check_job_moderation()
returns trigger as $$
declare
  v_hit record;
  v_label text;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('job', new.id, new.employer_id, v_hit.matched_keyword, v_hit.matched_category, new.title);

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
    insert into moderation_flags (source_type, listing_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('listing', new.id, new.seller_id, v_hit.matched_keyword, v_hit.matched_category, new.title);

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

-- Pastikan trigger-nya memang terpasang dan menunjuk ke function di
-- atas (jaga-jaga kalau trigger-nya sendiri sempat ke-drop tapi belum
-- dibuat ulang di migration sebelumnya).
drop trigger if exists trg_check_job_moderation on jobs;
create trigger trg_check_job_moderation
  before insert or update of title, description on jobs
  for each row execute function public.check_job_moderation();

drop trigger if exists trg_check_listing_moderation on digital_listings;
create trigger trg_check_listing_moderation
  before insert or update of title, description on digital_listings
  for each row execute function public.check_listing_moderation();

-- ---------------------------------------------------------
-- CEK CEPAT SETELAH RUN (opsional): jalankan query ini terpisah utk
-- pastikan trigger-nya benar-benar terpasang & aktif, tanpa perlu
-- posting job/produk baru buat nyoba:
--
-- select tgname, tgenabled from pg_trigger
-- where tgrelid in ('jobs'::regclass, 'digital_listings'::regclass)
--   and tgname like 'trg_check_%moderation';
--
-- Harusnya keluar 2 baris (trg_check_job_moderation &
-- trg_check_listing_moderation) dengan tgenabled = 'O' (aktif).
-- ---------------------------------------------------------
