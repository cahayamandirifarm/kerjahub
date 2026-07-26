-- =========================================================
-- KERJAHUB — MIGRATION 0078: PERBAIKAN FINAL FILTER KATA (ALL-IN-ONE)
-- Jalankan SETELAH 0001-0075. Menggantikan isi 0076 & 0077 (aman
-- dijalankan meski 0076/0077 sudah/belum pernah dijalankan sebelumnya
-- -- semua perintah di sini idempotent).
--
-- KENAPA ADA MIGRATION INI: sudah 2x diperbaiki (0076, 0077) tapi popup
-- penolakan masih belum muncul. Kemungkinan terbesar: policy RLS INSERT
-- di tabel `moderation_flags` (harusnya sudah ditambahkan migration
-- 0067) belum pernah ter-apply di database ini. Tanpa policy itu,
-- trigger check_job_moderation()/check_listing_moderation() gagal
-- duluan di baris "insert into moderation_flags" dengan error RLS
-- ("new row violates row-level security policy") -- errcode-nya BUKAN
-- 'P0001', jadi frontend tidak mengenalinya dan malah nampilin pesan
-- default "Gagal memasang penawaran/tawaran. Coba lagi." Trigger-nya
-- sendiri jadi TIDAK PERNAH sampai ke baris `raise exception` yang
-- berisi pesan penolakan.
--
-- Migration ini menjamin ULANG (create if not exists / create or
-- replace di semuanya) 3 hal sekaligus dalam SATU file, supaya tidak
-- ada lagi celah "migration mana yang belum ke-run":
--   1) Policy RLS INSERT moderation_flags (dari 0067).
--   2) Trigger function check_job_moderation() & check_listing_moderation()
--      dengan pesan yang sebut kategori (dari 0077, inline, tanpa
--      dependency ke function terpisah).
--   3) Trigger BEFORE INSERT/UPDATE di jobs & digital_listings yang
--      menunjuk ke function di atas (jaga-jaga kalau attachment-nya
--      sendiri hilang/tidak sesuai).
--
-- CARA JALANKAN: copy SELURUH isi file ini ke Supabase SQL Editor,
-- Run SATU KALI untuk semuanya. Setelah itu jalankan query VERIFIKASI
-- di paling bawah file ini (di luar migration, boleh dijalankan
-- terpisah) buat mastiin semuanya benar-benar aktif SEBELUM coba
-- posting ulang.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Pastikan policy RLS INSERT moderation_flags ada (dari 0067).
--    drop dulu baru create supaya idempotent walau sudah pernah ada.
-- ---------------------------------------------------------
drop policy if exists "Sistem bisa catat log moderasi" on moderation_flags;
create policy "Sistem bisa catat log moderasi" on moderation_flags
  for insert with check (auth.uid() = owner_id or public.is_admin());

-- ---------------------------------------------------------
-- 2) Trigger function -- pesan sebut kategori, inline (tanpa
--    dependency ke function terpisah, dari 0077).
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 3) Pastikan trigger-nya terpasang & aktif.
-- ---------------------------------------------------------
drop trigger if exists trg_check_job_moderation on jobs;
create trigger trg_check_job_moderation
  before insert or update of title, description on jobs
  for each row execute function public.check_job_moderation();

drop trigger if exists trg_check_listing_moderation on digital_listings;
create trigger trg_check_listing_moderation
  before insert or update of title, description on digital_listings
  for each row execute function public.check_listing_moderation();

-- =========================================================
-- VERIFIKASI (jalankan terpisah setelah migration di atas selesai,
-- SEBELUM coba posting ulang):
--
-- A) Trigger aktif?
-- select tgname, tgenabled from pg_trigger
-- where tgrelid in ('jobs'::regclass, 'digital_listings'::regclass)
--   and tgname like 'trg_check_%moderation';
-- -> harus keluar 2 baris, tgenabled = 'O'
--
-- B) Policy INSERT moderation_flags ada?
-- select policyname, cmd from pg_policies
-- where tablename = 'moderation_flags';
-- -> harus ada baris "Sistem bisa catat log moderasi" dengan cmd = 'INSERT'
--
-- C) Tes fungsi deteksi kata kunci langsung (tanpa perlu posting):
-- select * from public.text_has_moderation_keyword('contoh sugar baby test');
-- -> harus keluar 1 baris (matched_keyword = 'sugar baby', matched_category = 'dating_dewasa')
-- =========================================================
