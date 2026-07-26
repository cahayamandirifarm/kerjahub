-- =========================================================
-- KERJAHUB — MIGRATION 0081: SAPUAN RETROAKTIF ULANG
-- Jalankan SETELAH 0080.
--
-- KENAPA PERLU INI: sapuan retroaktif di 0065 & 0068 cuma jalan SATU
-- KALI, persis di saat migration itu di-run. Postingan job/jasa atau
-- produk yang dibuat SETELAH sapuan itu, tapi SEBELUM bug FK di trigger
-- diperbaiki (migration 0080), tidak pernah ikut ter-cek sama sekali --
-- triggernya selalu crash duluan (lihat 0080) sebelum sempat menolak,
-- jadi postingan yang mengandung kata terlarang (mis. "teman curhat")
-- tetap lolos tersimpan & tampil aktif seperti biasa.
--
-- Migration ini menyapu ULANG semua job/jasa & produk yang MASIH AKTIF
-- sekarang pakai fungsi pencocokan kata kunci TERKINI (public.
-- text_has_moderation_keyword, sudah termasuk fuzzy match 0068 & kata
-- "dating online" dari 0079) -- yang cocok langsung dinonaktifkan, sama
-- seperti proses aslinya di 0065/0068.
--
-- AMAN dijalankan ulang berapa kali pun (idempotent) -- yang sudah
-- nonaktif dilewati begitu saja oleh kondisi `where is_active = true` /
-- `where status = 'aktif'`.
-- =========================================================

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

-- ---------------------------------------------------------
-- VERIFIKASI: lihat semua job/produk yang baru saja disapu & alasannya
-- (kalau kosong, berarti memang tidak ada lagi postingan aktif yang
-- cocok kata kunci saat ini):
--
-- select source_type, title_snapshot, matched_keyword, matched_category, created_at
-- from moderation_flags
-- order by created_at desc
-- limit 50;
-- ---------------------------------------------------------
