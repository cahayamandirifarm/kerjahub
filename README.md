# Patch: Popup "Hapus Postingan atau Tetap Diposting" setelah pekerjaan selesai

Isi paket ini HANYA file yang baru ditambah / diubah. Timpa ke path yang
sama persis di repo kamu.

## File BARU
- `supabase/migrations/0031_finish_popup_remove_posting.sql`
- `lib/FinishPopupContext.tsx`
- `components/FinishPopupOverlay.tsx`

## File DIUBAH (timpa file lama kamu dengan ini)
- `app/layout.tsx`
- `components/JobPostingActions.tsx`
- `app/dashboard/employer/page.tsx`
- `app/dashboard/worker/page.tsx`

## Cara pakai
1. Salin/timpa ketujuh file di atas ke repo git project kamu, di path yang
   sama persis (buat foldernya kalau belum ada).
2. `git add . && git commit -m "feat: popup hapus/tetap posting setelah pekerjaan selesai" && git push`
3. Jalankan migration ke Supabase:
   `supabase db push`
   (atau paste isi file `.sql` di atas ke Supabase Dashboard → SQL Editor → Run)
4. Deploy seperti biasa (Vercel dsb.) — pastikan migration di atas sudah
   jalan duluan/bersamaan supaya RPC yang dipanggil dari
   `FinishPopupContext` sudah tersedia di database.

Lihat komentar di dalam file migration untuk detail lengkap kenapa "Hapus
Postingan" untuk job yang sudah selesai memakai soft delete (bukan hapus
permanen).
