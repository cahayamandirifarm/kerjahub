-- =========================================================
-- KERJAHUB — MIGRATION 0076: PESAN PENOLAKAN FILTER KATA SEBUT KATEGORI
-- Jalankan SETELAH 0001-0075.
--
-- Sebelumnya (0071) pesan error saat postingan job/jasa atau produk
-- marketplace kena filter kata moderasi (0065) generik -- tidak bilang
-- kategori kata terlarang mana yang cocok, cuma "terindikasi mengandung
-- konten yang dilarang platform". Diganti supaya sebut kategorinya
-- langsung ("Dating Online", "Scam", dst) sesuai `matched_category`
-- yang sudah dideteksi `text_has_moderation_keyword()` -- fungsi
-- deteksi kata kuncinya sendiri TIDAK berubah, cuma teks pesannya.
--
-- Frontend (components/JobForm.tsx & ListingForm.tsx) sudah otomatis
-- menampilkan persis teks exception ini ke user kalau error.code =
-- 'P0001', jadi tidak perlu perubahan apa pun di sisi frontend.
-- =========================================================

create or replace function public.moderation_category_label(p_category text)
returns text as $$
  select case p_category
    when 'dating_dewasa' then 'Dating Online / Konten Dewasa'
    when 'scam' then 'Penipuan (Scam)'
    when 'curhat_teman' then 'Jasa Teman/Curhat Berbayar'
    else 'konten yang dilarang platform'
  end;
$$ language sql immutable;

create or replace function public.check_job_moderation()
returns trigger as $$
declare
  v_hit record;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('job', new.id, new.employer_id, v_hit.matched_keyword, v_hit.matched_category, new.title);
    raise exception 'Ditolak oleh sistem — postingan terindikasi mengandung konten % dan sejenisnya. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.',
      public.moderation_category_label(v_hit.matched_category)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.check_listing_moderation()
returns trigger as $$
declare
  v_hit record;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, listing_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('listing', new.id, new.seller_id, v_hit.matched_keyword, v_hit.matched_category, new.title);
    raise exception 'Ditolak oleh sistem — produk terindikasi mengandung konten % dan sejenisnya. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.',
      public.moderation_category_label(v_hit.matched_category)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;
