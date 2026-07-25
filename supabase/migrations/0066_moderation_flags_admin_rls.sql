-- =========================================================
-- KERJAHUB — MIGRATION 0066: RLS TAMBAHAN UTK PANEL ADMIN "FILTER KATA POSTINGAN"
-- Jalankan SETELAH 0065.
--
-- migration 0065 cuma kasih admin akses SELECT ke moderation_flags (log
-- audit). Panel admin barunya butuh admin bisa tandai "sudah ditinjau" &
-- hapus log lama -- tambahkan policy UPDATE & DELETE.
-- =========================================================

create policy "Admin update log moderasi" on moderation_flags
  for update using (public.is_admin()) with check (public.is_admin());

create policy "Admin hapus log moderasi" on moderation_flags
  for delete using (public.is_admin());
