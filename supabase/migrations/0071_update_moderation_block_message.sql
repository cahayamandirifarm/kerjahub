-- Update teks pesan error yang ditampilkan ke user saat postingan
-- job/jasa atau produk marketplace ditolak oleh filter kata moderasi
-- (lihat 0065_content_moderation_filter.sql). Cuma ganti teks pesan --
-- logika deteksi kata kunci (public.text_has_moderation_keyword, sudah
-- diperkuat di 0068) TIDAK berubah.
create or replace function public.check_job_moderation()
returns trigger as $$
declare
  v_hit record;
begin
  select * into v_hit from public.text_has_moderation_keyword(coalesce(new.title, '') || ' ' || coalesce(new.description, ''));
  if found then
    insert into moderation_flags (source_type, job_id, owner_id, matched_keyword, matched_category, title_snapshot)
    values ('job', new.id, new.employer_id, v_hit.matched_keyword, v_hit.matched_category, new.title);
    raise exception 'Postingan tidak bisa disimpan — judul/deskripsi terindikasi mengandung konten yang dilarang platform. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.'
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
    raise exception 'Produk tidak bisa disimpan — judul/deskripsi terindikasi mengandung konten yang dilarang platform. Silakan posting jasa/produk yang bermanfaat untuk masyarakat dan positif lalu coba lagi.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql;
