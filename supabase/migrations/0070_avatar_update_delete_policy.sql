-- Bucket 'avatars' (dibuat di 0001_init.sql) sebelumnya cuma punya policy
-- SELECT (publik) dan INSERT (upload sendiri) -- belum ada policy UPDATE
-- atau DELETE. Fitur "Ganti Foto Profil" baru butuh DELETE supaya file
-- foto profil LAMA milik user bisa dihapus dari storage saat diganti
-- dengan foto baru (biar tidak numpuk file tak terpakai di bucket).
create policy "User hapus avatar sendiri" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
