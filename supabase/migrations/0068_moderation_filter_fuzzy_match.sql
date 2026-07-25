-- =========================================================
-- KERJAHUB — MIGRATION 0068: PERKUAT MATCHING FILTER MODERASI
-- Jalankan SETELAH 0067.
--
-- MASALAH: migration 0065 pakai exact substring match ('%teman curhat%').
-- Postingan lolos filter dengan variasi kecil:
--   - ejaan informal: "temen curhat" (bukan "teman curhat")
--   - kata sisipan: "teman cerita dan curhat" (bukan frasa utuh)
--   - urutan lain / kata beda: "teman cerita", "teman ngopi", dst.
--
-- PERBAIKAN:
-- 1) Normalisasi ejaan informal umum sebelum dicocokkan (temen->teman,
--    dkk) lewat public.normalize_moderation_text().
-- 2) Untuk keyword yang terdiri >1 kata, cek SEMUA kata dari keyword itu
--    muncul di teks (di mana saja, tidak harus bersebelahan/berurutan) --
--    bukan cuma cek frasa utuh persis. Keyword 1 kata tetap substring
--    match biasa.
-- 3) Tambah keyword baru yang kebukti lolos di production (teman cerita,
--    dll).
-- 4) Sapuan retroaktif ulang pakai matching baru untuk jobs/listing yang
--    masih aktif.
-- =========================================================

-- Normalisasi ejaan informal Indonesia yang sering dipakai untuk
-- menghindari filter kata kunci literal. Daftar ini SENGAJA fokus ke
-- kata yang relevan dengan kategori moderasi (teman/kencan/dsb), bukan
-- normalisasi bahasa umum -- supaya tidak berdampak ke pencocokan lain.
create or replace function public.normalize_moderation_text(p_text text)
returns text as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p_text, '')), '\mtemen\M', 'teman', 'g'),
        '\mtemenan\M', 'teman', 'g'
      ),
      '\mcurhatan\M', 'curhat', 'g'
    ),
    '\s+', ' ', 'g'
  );
$$ language sql immutable;

-- Ganti fungsi pencocokan: keyword multi-kata dicek per-kata (semua kata
-- keyword harus muncul di teks, di posisi manapun), bukan cuma frasa utuh.
-- Keyword 1 kata tetap substring match seperti sebelumnya.
create or replace function public.text_has_moderation_keyword(p_text text)
returns table (matched_keyword text, matched_category text) as $$
  with normalized as (
    select public.normalize_moderation_text(p_text) as t
  ),
  candidates as (
    select
      mk.keyword,
      mk.category,
      string_to_array(public.normalize_moderation_text(mk.keyword), ' ') as words
    from moderation_keywords mk
    where mk.is_active
  )
  select c.keyword, c.category
  from candidates c, normalized n
  where not exists (
    select 1 from unnest(c.words) w
    where w <> '' and n.t not like '%' || w || '%'
  )
  limit 1;
$$ language sql stable security definer;

-- Keyword baru -- variasi yang terbukti lolos filter lama di production
-- (dicek manual dari postingan yang masih tampil setelah migration 0065).
insert into moderation_keywords (keyword, category) values
  ('teman cerita', 'curhat_teman'),
  ('temen cerita', 'curhat_teman'),
  ('teman ngopi', 'curhat_teman'),
  ('teman ngobrol', 'curhat_teman'),
  ('teman sharing', 'curhat_teman'),
  ('teman main', 'curhat_teman')
on conflict (lower(keyword)) do nothing;

-- ===== Sapuan retroaktif ulang pakai matching baru =====
do $$
declare
  r record;
  v_hit record;
begin
  for r in select id, employer_id, title, description from jobs where is_active = true loop
    select * into v_hit from public.text_has_moderation_keyword(coalesce(r.title, '') || ' ' || coalesce(r.description, ''));
    if found then
      update jobs set is_active = false where id = r.id;
      insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
      values ('job', r.id, r.employer_id, v_hit.matched_keyword, v_hit.matched_category, r.title);
    end if;
  end loop;

  for r in select id, seller_id, title, description from digital_listings where status = 'aktif' loop
    select * into v_hit from public.text_has_moderation_keyword(coalesce(r.title, '') || ' ' || coalesce(r.description, ''));
    if found then
      update digital_listings set status = 'nonaktif' where id = r.id;
      insert into moderation_flags (source_type, listing_id, owner_id, matched_keyword, matched_category, title_snapshot)
      values ('listing', r.id, r.seller_id, v_hit.matched_keyword, v_hit.matched_category, r.title);
    end if;
  end loop;
end $$;
