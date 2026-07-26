-- =========================================================
-- KERJAHUB — MIGRATION 0082: BADGE ICON CHAT TIDAK PERNAH HILANG
-- WALAU SEMUA PERCAKAPAN YANG TAMPIL SUDAH DIBACA
--
-- AKAR MASALAH: public.my_unread_chat_count() -- fungsi yang menghitung
-- angka merah di ikon chat navbar -- dibuat sekali di migration 0007 dan
-- TIDAK PERNAH diperbarui lagi sesudahnya. Migration 0038 menambahkan
-- kolom conversation_members.hidden_at (dipakai saat pengguna hapus
-- riwayat chat dari daftarnya sendiri, DAN dipakai otomatis oleh 0055
-- saat sebuah chat nego "auto-hide" begitu job/order selesai) --
-- list_my_conversations() SUDAH mengecualikan percakapan yang hidden_at-
-- nya terisi, tapi my_unread_chat_count() TIDAK PERNAH ikut diperbarui
-- untuk mengecualikannya.
--
-- Akibatnya: kalau ada percakapan yang jadi hidden (dihapus manual atau
-- auto-hide selesai job) SAAT MASIH ADA pesan berstatus belum dibaca di
-- dalamnya, percakapan itu hilang dari daftar Aktif maupun Arsip
-- (sehingga user tidak punya cara untuk membukanya lagi & menandainya
-- terbaca), TAPI badge merah di navbar tetap menghitungnya selamanya --
-- persis seperti yang dilaporkan: daftar chat kosong/semua sudah
-- terbaca, tapi ikon chat tetap menampilkan angka.
--
-- PERBAIKAN: samakan logikanya dengan list_my_conversations() --
-- kecualikan percakapan yang hidden_at terisi DAN belum ada pesan baru
-- sesudahnya.
-- =========================================================

create or replace function public.my_unread_chat_count()
returns bigint as $$
  select count(*)::bigint
  from message_reads mr
  join messages m on m.id = mr.message_id
  join conversations c on c.id = m.conversation_id
  join conversation_members cm on cm.conversation_id = m.conversation_id and cm.profile_id = auth.uid()
  where mr.profile_id = auth.uid()
    and mr.status <> 'dibaca'
    and cm.is_archived = false
    and (cm.hidden_at is null or c.last_message_at > cm.hidden_at);
$$ language sql stable security definer;

-- ---------------------------------------------------------
-- VERIFIKASI (jalankan sebagai diri sendiri lewat aplikasi, bukan lewat
-- SQL Editor -- fungsi ini pakai auth.uid() jadi hasilnya beda kalau
-- dijalankan langsung di SQL Editor sebagai postgres/service role):
-- buka /chat, badge di navbar sekarang harusnya 0 kalau semua percakapan
-- yang TAMPIL di daftar (Aktif/Arsip) sudah dibaca semua, walau ada
-- percakapan lama yang sudah di-hide/auto-hide dengan pesan belum dibaca
-- di dalamnya.
-- ---------------------------------------------------------
