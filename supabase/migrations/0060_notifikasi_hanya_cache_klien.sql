-- =========================================================
-- KERJAHUB — MIGRATION 0057: NOTIFIKASI & BADGE HANYA DI CACHE PENGGUNA
-- Jalankan SETELAH 0001-0056.
--
-- Sebelumnya setiap notifikasi (chat, lamaran, pembayaran, escrow, dll)
-- disimpan PERMANEN di tabel `notifications`, dan halaman /notifications
-- serta badge unread dihitung dari tabel ini.
--
-- Migration ini mengubah tabel `notifications` jadi PERANTARA SESAAT
-- saja:
--   1. Baris tetap di-insert seperti biasa (supaya trigger push yang
--      sudah ada -- trg_notify_push_for_notification, dibuat di 0044 --
--      tetap terpicu, dan supaya Supabase Realtime tetap mengirim event
--      INSERT ke klien yang sedang terbuka, persis seperti sebelumnya).
--   2. SEGERA setelah itu, baris tersebut DIHAPUS PERMANEN dari database
--      lewat trigger baru di bawah -- tidak pernah tersimpan sebagai
--      riwayat di server.
--
-- Riwayat notifikasi & angka badge sepenuhnya dipindah ke cache
-- (IndexedDB) di perangkat pengguna masing-masing -- lihat
-- lib/notifCache.ts (dipakai halaman/app saat terbuka) dan
-- public/service-worker.js (dipakai saat push masuk ketika app di
-- background/tertutup). Konsekuensi: riwayat notifikasi TIDAK ikut
-- pindah/sinkron antar perangkat -- itu memang tujuannya (server tidak
-- lagi menyimpan riwayat sama sekali).
--
-- Trigger baru di bawah SENGAJA diberi nama "trg_zz_..." supaya urutan
-- eksekusinya (Postgres menjalankan AFTER INSERT trigger per tabel
-- berurutan sesuai ABJAD nama trigger) selalu PALING TERAKHIR --
-- berjalan SETELAH trg_notify_push_for_notification (0044) selesai
-- memicu panggilan pg_net. Baris tetap "ada" cukup lama untuk sempat
-- direplikasi ke klien lewat Realtime & memicu pg_net (yang sudah
-- membawa seluruh isi notifikasi di payload-nya sendiri, jadi TIDAK
-- perlu query ulang ke tabel ini) -- baru setelah itu langsung dihapus.
-- =========================================================

create or replace function public.purge_notification_after_dispatch()
returns trigger as $$
begin
  delete from notifications where id = new.id;
  return null; -- ini AFTER trigger, nilai kembalian diabaikan Postgres
exception when others then
  -- jangan sampai kegagalan hapus baris ini mengganggu proses aslinya
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_zz_purge_notification on notifications;
create trigger trg_zz_purge_notification
  after insert on notifications
  for each row execute procedure public.purge_notification_after_dispatch();

-- Sertakan juga `category` di payload push notifikasi umum (sebelumnya
-- tidak ikut dikirim) -- dipakai klien (service worker) untuk menyimpan
-- kategori yang benar di cache riwayat lokal.
create or replace function public.notify_push_for_notification()
returns trigger as $$
declare
  v_url text;
  v_secret text;
begin
  if new.category = 'chat' then
    return new; -- chat sudah dapat push lewat trg_notify_push_for_message
  end if;

  select function_url, webhook_secret into v_url, v_secret from push_config where id = 1;
  if v_url is null or v_url = '' then
    return new; -- edge function belum dikonfigurasi
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object(
      'kind', 'generic',
      'notification_id', new.id,
      'profile_id', new.profile_id,
      'title', new.title,
      'body', new.body,
      'link', new.link,
      'category', new.category
    )
  );

  return new;
exception when others then
  return new;
end;
$$ language plpgsql security definer;
