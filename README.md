# Patch: "Tetap Diposting" sekarang benar-benar membuka lowongan baru

Update lanjutan dari patch sebelumnya (`0031_finish_popup_remove_posting.sql`).
Sebelumnya "Tetap Diposting" cuma menutup popup tanpa mengubah apa pun,
jadi postingan yang sudah `selesai` tidak pernah muncul lagi di beranda.
Sekarang "Tetap Diposting" akan membuat POSTINGAN BARU (judul/kategori/
harga/lokasi sama persis) berstatus terbuka, langsung tampil di beranda
dan siap menerima pelamar baru -- sementara postingan lama yang sudah
selesai tetap utuh di riwayat (foto, rating, transaksi tidak disentuh).

## File BARU
- `supabase/migrations/0032_repost_on_keep_posting.sql`

## File DIUBAH (timpa file lama kamu dengan ini)
- `lib/FinishPopupContext.tsx`
- `components/FinishPopupOverlay.tsx`

## Cara pakai
1. Timpa ketiga file di atas ke path yang sama persis di repo kamu.
2. `git add . && git commit -m "fix: tetap diposting membuka lowongan baru di beranda" && git push`
3. Jalankan migration baru ke Supabase: `supabase db push`
   (atau paste isi `0032_repost_on_keep_posting.sql` ke SQL Editor Supabase Dashboard → Run)

Migration `0032` ini menimpa fungsi `keep_job_posting()` yang sebelumnya
dibuat di `0031` -- jalankan berurutan (0031 dulu baru 0032) kalau kamu
belum pernah menjalankan 0031 sama sekali.
