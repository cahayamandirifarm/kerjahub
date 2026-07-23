-- =========================================================
-- KERJAHUB — MIGRATION 0054: AUTO-HAPUS (SEMBUNYIKAN) BUBLE CHAT NEGO
-- SAAT TRANSAKSI SELESAI ATAU DIBATALKAN
--
-- CATATAN NOMOR FILE: sesuaikan urutan angka file ini kalau di folder
-- migrations kamu nomor 0054 sudah dipakai file lain -- yang penting
-- dijalankan PALING TERAKHIR (setelah semua migration lain).
--
-- Perilaku yang diminta: begitu transaksi hasil nego harga di chat
-- (postingan is_nego) SELESAI atau DIBATALKAN, percakapannya otomatis
-- hilang dari daftar chat KEDUA belah pihak -- persis seperti kalau
-- mereka menghapus riwayat chat itu sendiri secara manual (fitur
-- delete_conversation_history, migrasi 0038).
--
-- KENAPA "SEMBUNYIKAN" (soft), BUKAN HAPUS PERMANEN:
-- Menghapus baris `conversations` beneran (hard delete) akan otomatis
-- ikut menghapus SELURUH riwayat pesan & tawaran nego (on delete
-- cascade) -- itu berisiko kalau nanti dibutuhkan buat audit/dispute.
-- Jadi dipakai mekanisme yang SUDAH ADA (conversation_members.hidden_at,
-- migrasi 0038): percakapan hilang dari daftar chat pengguna, tapi
-- datanya tetap aman di database, dan otomatis muncul lagi kalau
-- suatu saat ada pesan baru masuk (mis. postingan yang sama dinego
-- ulang dari awal setelah dibuka lagi).
--
-- KENAPA PAKAI TRIGGER DI TABEL `jobs` (bukan tempel manual di setiap
-- fungsi penyelesaian/pembatalan): ada banyak jalur berbeda yang bisa
-- mengubah jobs.stage jadi 'selesai' (mis. migrasi 0001, 0002, 0025,
-- 0028, 0031, 0034) atau 'dibatalkan'/reopen ke 'terbuka' (mis.
-- migrasi 0016, 0026, 0045, 0046). Trigger di level tabel menjamin
-- SEMUA jalur itu tertangkap otomatis dari satu tempat, tanpa perlu
-- mengedit ulang setiap fungsi satu-satu (dan gampang lupa kalau ada
-- fungsi baru lagi ke depannya).
--
-- Yang dianggap "postingan pakai harga nego lewat chat": job yang
-- punya minimal satu baris nego_offers berstatus 'diterima' -- sinyal
-- yang sama persis dipakai di migrasi 0049 & 0050.
-- =========================================================

create or replace function public.auto_hide_nego_chat_on_job_finish()
returns trigger as $$
declare
  v_conv_id uuid;
begin
  -- Hanya proses kalau stage BENAR-BENAR berubah, dan berubah jadi salah
  -- satu dari: selesai (transaksi kelar), dibatalkan (dibatalkan
  -- permanen), atau terbuka (dibuka lagi setelah pembayaran dibatalkan
  -- -- lihat migrasi 0046, ini yang terjadi kalau user klik "Batalkan"
  -- di popup pembayaran).
  if new.stage is distinct from old.stage
     and new.stage in ('selesai', 'dibatalkan', 'terbuka')
     and exists (select 1 from nego_offers no where no.job_id = new.id and no.status = 'diterima')
  then
    for v_conv_id in select id from conversations where job_id = new.id loop
      update conversation_members
      set hidden_at = now()
      where conversation_id = v_conv_id
        and hidden_at is null; -- jangan timpa kalau salah satu pihak sudah pernah menghapus manual sebelumnya
    end loop;
  end if;

  return new;
exception when others then
  -- jangan sampai kegagalan di sini menggagalkan proses penyelesaian/
  -- pembatalan job yang sebenarnya (jauh lebih penting).
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auto_hide_nego_chat on jobs;
create trigger trg_auto_hide_nego_chat
  after update of stage on jobs
  for each row execute procedure public.auto_hide_nego_chat_on_job_finish();
