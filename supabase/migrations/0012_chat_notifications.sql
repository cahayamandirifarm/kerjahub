-- =========================================================
-- KERJAHUB — MIGRATION 0012: NOTIFIKASI CHAT (nada suara + notif bar)
-- Jalankan SETELAH 0001-0011.
--
-- Sebelumnya, tabel `notifications` (yang dibaca NotificationContext utk
-- menampilkan toast + bunyi "beep" saat app terbuka) hanya diisi untuk
-- kasus /tanyaadmin. Pesan chat BIASA tidak pernah membuat baris
-- notifikasi, jadi tidak ada toast/suara sama sekali untuk chat masuk
-- saat app sedang dibuka.
--
-- Migration ini memperluas trigger `handle_new_message` (dibuat di
-- 0006_chat_system.sql) supaya SETIAP pesan chat baru (bukan pesan
-- sistem) membuat baris notifikasi untuk anggota lain di percakapan
-- itu — otomatis memicu toast + suara di NotificationContext (foreground)
-- TANPA mengubah trigger push background (`trg_notify_push_for_message`,
-- yang membaca tabel `messages` langsung, jadi tidak dobel).
--
-- Untuk notifikasi bar sistem (Android/desktop notification tray) saat
-- app di-background/ditutup pada PWA yang sudah diinstall, itu lewat
-- jalur Web Push yang sudah dibangun di 0009_push_notifications.sql —
-- lihat README bagian "Setup Push Notification (WAJIB untuk notif bar
-- PWA)" untuk langkah konfigurasi VAPID + deploy edge function yang
-- belum pernah dilakukan.
-- =========================================================

create or replace function public.handle_new_message()
returns trigger as $$
declare
  v_dispute_id uuid;
  v_admin record;
  v_sender_name text;
  v_recipient record;
begin
  -- update last_message_at percakapan (kecuali pesan sistem kosong)
  update conversations set last_message_at = new.created_at where id = new.conversation_id;

  -- tandai status "terkirim" untuk semua anggota lain
  insert into message_reads (message_id, profile_id, status)
  select new.id, cm.profile_id, 'terkirim'
  from conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.profile_id <> new.sender_id
  on conflict (message_id, profile_id) do nothing;

  -- notifikasi in-app (toast + bunyi lewat NotificationContext saat app
  -- terbuka). Trigger push background (trg_notify_push_for_message)
  -- terpisah dan membaca tabel `messages` langsung, jadi tidak dobel.
  if not new.is_system then
    select full_name into v_sender_name from profiles where id = new.sender_id;

    for v_recipient in
      select profile_id from conversation_members
      where conversation_id = new.conversation_id and profile_id <> new.sender_id
    loop
      insert into notifications (profile_id, title, body, link, category)
      values (
        v_recipient.profile_id,
        coalesce(v_sender_name, 'Pesan baru'),
        case
          when new.message_type = 'image' then '📷 Mengirim gambar'
          when new.message_type = 'document' then '📄 ' || coalesce(nullif(new.content, ''), 'Mengirim dokumen')
          else left(new.content, 120)
        end,
        '/chat/' || new.conversation_id,
        'chat'
      );
    end loop;
  end if;

  if not new.is_system and left(trim(new.content), 11) = '/tanyaadmin' then
    insert into disputes (conversation_id, opened_by, trigger_message_id)
    values (new.conversation_id, new.sender_id, new.id)
    returning id into v_dispute_id;

    update conversations set is_dispute = true, is_locked = true where id = new.conversation_id;

    insert into messages (conversation_id, sender_id, content, message_type, is_system)
    values (
      new.conversation_id, new.sender_id,
      'Admin telah diminta bergabung ke percakapan ini untuk menangani sengketa. Riwayat chat mulai saat ini menjadi bukti dan tidak dapat diubah.',
      'system', true
    );

    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (profile_id, title, body, link, category)
      values (
        v_admin.id, 'Sengketa baru butuh admin',
        'Sebuah percakapan meminta bantuan admin lewat /tanyaadmin.',
        '/admin/disputes/' || v_dispute_id, 'chat'
      );
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- trigger sudah ada (dibuat di 0006), replace function di atas sudah cukup —
-- tapi re-create juga supaya idempotent kalau urutan migration berubah.
drop trigger if exists trg_handle_new_message on messages;
create trigger trg_handle_new_message
  after insert on messages
  for each row execute procedure public.handle_new_message();
