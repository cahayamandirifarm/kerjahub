-- =========================================================
-- KERJAHUB — MIGRATION 0043: ISI KONFIGURASI PUSH_CONFIG
--
-- LATAR BELAKANG:
-- Trigger `notify_push_for_message` (0009_push_notifications.sql) tidak
-- akan pernah memanggil edge function `send-chat-push` selama kolom
-- `function_url` di tabel `push_config` masih kosong. Sampai migration
-- ini dibuat, TIDAK ADA migration lain yang mengisi nilai tersebut,
-- jadi push notification (banner + badge saat app tertutup) belum
-- pernah benar-benar aktif.
--
-- CARA PAKAI (WAJIB dilakukan SEBELUM menjalankan migration ini):
--   1. Generate VAPID keys:
--        npx web-push generate-vapid-keys
--   2. Deploy edge function:
--        supabase functions deploy send-chat-push
--   3. Set secrets untuk edge function (WEBHOOK_SECRET bebas, string
--      acak apapun -- tapi harus SAMA PERSIS dengan yang dipakai di
--      langkah 4 di bawah):
--        supabase secrets set SUPABASE_URL=...
--        supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
--        supabase secrets set VAPID_PUBLIC_KEY=...
--        supabase secrets set VAPID_PRIVATE_KEY=...
--        supabase secrets set VAPID_SUBJECT=mailto:admin@kerjahub.app
--        supabase secrets set PUSH_WEBHOOK_SECRET=...
--   4. GANTI DUA NILAI di bawah ini (v_function_url & v_webhook_secret)
--      sebelum menjalankan migration ini:
--        - v_function_url    -> URL edge function hasil deploy langkah 2,
--          formatnya: https://<project-ref>.functions.supabase.co/send-chat-push
--        - v_webhook_secret  -> HARUS SAMA PERSIS dengan PUSH_WEBHOOK_SECRET
--          di langkah 3.
--   5. Set juga NEXT_PUBLIC_VAPID_PUBLIC_KEY di .env aplikasi Next.js
--      (pakai public key yang sama dari langkah 1), lalu redeploy app.
--
-- Migration ini AMAN dijalankan berkali-kali (idempotent) -- hanya
-- meng-update baris tunggal id=1 di push_config.
-- =========================================================

do $$
declare
  -- ⚠️ GANTI DUA BARIS INI SEBELUM MENJALANKAN MIGRATION ⚠️
  v_function_url text := 'GANTI_DENGAN_URL_EDGE_FUNCTION_ANDA';
  v_webhook_secret text := 'GANTI_DENGAN_PUSH_WEBHOOK_SECRET_ANDA';
begin
  if v_function_url = 'GANTI_DENGAN_URL_EDGE_FUNCTION_ANDA'
     or v_webhook_secret = 'GANTI_DENGAN_PUSH_WEBHOOK_SECRET_ANDA' then
    raise notice '=======================================================';
    raise notice 'push_config BELUM diisi -- kamu lupa mengganti placeholder';
    raise notice 'v_function_url / v_webhook_secret di file migration ini';
    raise notice 'sebelum menjalankannya. Edit file 0043_set_push_config.sql';
    raise notice 'lalu jalankan ulang `supabase db push`.';
    raise notice '=======================================================';
    return;
  end if;

  update push_config
  set function_url = v_function_url,
      webhook_secret = v_webhook_secret,
      updated_at = now()
  where id = 1;

  raise notice 'push_config berhasil diisi. Coba kirim chat lagi untuk tes push.';
end $$;
