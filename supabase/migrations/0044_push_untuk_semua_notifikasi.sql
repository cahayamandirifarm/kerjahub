-- =====================================================================
-- KERJAHUB — MIGRATION 0044: PUSH UNTUK SEMUA NOTIFIKASI
-- (lamaran kerja, pembayaran, escrow, dll — bukan cuma chat)
--
-- Cara pakai: Supabase SQL Editor -> paste -> Run.
--
-- Tabel `notifications` (profile_id, title, body, link, category) sudah
-- diisi untuk SEMUA event di app (lihat category default 'umum'; chat
-- pakai category 'chat'). Trigger ini memicu push untuk semua baris
-- BARU di tabel itu KECUALI category='chat' — chat sudah punya jalur
-- push sendiri (trg_notify_push_for_message di 0009), supaya tidak
-- dobel notifikasi utk pesan chat.
-- =====================================================================

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
      'link', new.link
    )
  );

  return new;
exception when others then
  -- jangan sampai kegagalan panggilan push menggagalkan proses aslinya
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_push_for_notification on notifications;
create trigger trg_notify_push_for_notification
  after insert on notifications
  for each row execute procedure public.notify_push_for_notification();
