-- Kata "dating online" (dan variasinya) sebelumnya cuma dipakai sebagai
-- LABEL kategori di pesan popup penolakan ("Dating Online / Konten
-- Dewasa"), bukan kata kunci yang benar-benar dicocokkan ke
-- judul/deskripsi postingan. Jadi kalau user mengetik persis "dating
-- online", trigger moderasi TIDAK PERNAH ter-trigger -- postingan lolos
-- normal tanpa error, bukan gagal menampilkan popup.
--
-- Tambahkan sebagai kata kunci sungguhan supaya benar-benar tersaring.
insert into moderation_keywords (keyword, category) values
  ('dating online', 'dating_dewasa'),
  ('online dating', 'dating_dewasa'),
  ('jasa dating', 'dating_dewasa'),
  ('cari pasangan online', 'dating_dewasa')
on conflict (lower(keyword)) do nothing;
