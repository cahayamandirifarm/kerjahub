-- =========================================================
-- KERJAHUB — MIGRATION 0009: PUSH NOTIFICATION (Fase 4)
-- Jalankan SETELAH 0006, 0007, 0008.
--
--   - `push_subscriptions`: menyimpan Web Push subscription tiap
--     perangkat pengguna (satu user bisa punya banyak perangkat).
--   - `push_config`: 1 baris berisi URL Edge Function + secret rahasia
--     yang dipakai trigger utk memanggil fungsi push (diisi manual
--     SETELAH kamu deploy edge function-nya — lihat dokumentasi).
--   - Trigger otomatis: setiap pesan baru (bukan pesan sistem) memicu
--     panggilan HTTP async (lewat ekstensi pg_net) ke Edge Function
--     `send-chat-push`, yang lalu mengirim Web Push ke perangkat
--     anggota lain yang sedang di background.
-- =========================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

create policy "User kelola subscription push miliknya sendiri" on push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create table if not exists push_config (
  id int primary key default 1,
  function_url text,
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now(),
  constraint push_config_single_row check (id = 1)
);
insert into push_config (id) values (1) on conflict (id) do nothing;

-- hanya admin yang boleh melihat/mengubah konfigurasi (berisi secret)
alter table push_config enable row level security;
create policy "Hanya admin bisa lihat & ubah push_config" on push_config
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.notify_push_for_message()
returns trigger as $$
declare
  v_url text;
  v_secret text;
begin
  select function_url, webhook_secret into v_url, v_secret from push_config where id = 1;

  if v_url is null or v_url = '' or new.is_system then
    return new; -- edge function belum dikonfigurasi, atau ini pesan sistem — lewati
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id, 'sender_id', new.sender_id)
  );

  return new;
exception when others then
  -- jangan sampai kegagalan panggilan push menggagalkan pengiriman pesan itu sendiri
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_push_for_message on messages;
create trigger trg_notify_push_for_message
  after insert on messages
  for each row execute procedure public.notify_push_for_message();
