-- =========================================================
-- KERJAHUB — MIGRATION 0038: CHAT LIST CLEANUP
--
-- Tujuan:
--   1. Menu "Chat" tidak lagi menampilkan percakapan yang belum
--      pernah ada pesan sama sekali (percakapan pra-deal yang
--      dibuat otomatis lewat start_job_chat()/start_listing_chat()
--      tapi lawan bicara tidak pernah membalas / mengirim apa-apa).
--   2. Pengguna bisa menghapus riwayat chat dari daftar chat
--      mereka sendiri. Penghapusan bersifat per-pengguna (tidak
--      menghapus untuk lawan bicara, tidak menghapus pesan asli
--      dari database) — mirip perilaku umum aplikasi chat: kalau
--      lawan bicara mengirim pesan baru setelah dihapus, percakapan
--      otomatis muncul lagi di daftar.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom penanda "riwayat dihapus" per anggota percakapan
-- ---------------------------------------------------------
alter table conversation_members
  add column if not exists hidden_at timestamptz;

-- ---------------------------------------------------------
-- 2) RPC: delete_conversation_history
--    Menyembunyikan sebuah percakapan dari daftar chat pengguna
--    yang memanggil. Hanya berlaku untuk anggota percakapan itu
--    sendiri.
-- ---------------------------------------------------------
create or replace function public.delete_conversation_history(p_conversation_id uuid)
returns void as $$
begin
  update conversation_members
  set hidden_at = now()
  where conversation_id = p_conversation_id
    and profile_id = auth.uid();

  if not found then
    raise exception 'Percakapan tidak ditemukan';
  end if;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) list_my_conversations: perbarui aturan tampil
--    - hanya percakapan yang sudah pernah ada minimal 1 pesan
--    - sembunyikan yang sudah dihapus pengguna, kecuali sudah ada
--      pesan baru setelah waktu penghapusan
-- ---------------------------------------------------------
create or replace function public.list_my_conversations(
  p_archived boolean default false,
  p_search text default null
)
returns table (
  conversation_id uuid,
  source_type text,
  job_id uuid,
  order_id uuid,
  title text,
  other_id uuid,
  other_name text,
  other_avatar text,
  other_online boolean,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint,
  is_archived boolean,
  is_dispute boolean,
  is_locked boolean
) as $$
  select
    c.id as conversation_id,
    c.source_type,
    c.job_id,
    c.order_id,
    coalesce(j.title, dl.title, dl2.title, 'Percakapan') as title,
    op.id as other_id,
    op.full_name as other_name,
    op.avatar_url as other_avatar,
    coalesce(op.is_online, false) as other_online,
    lm.content as last_message,
    c.last_message_at,
    lm.sender_id as last_sender_id,
    (
      select count(*) from message_reads mr
      join messages m2 on m2.id = mr.message_id
      where m2.conversation_id = c.id and mr.profile_id = auth.uid() and mr.status <> 'dibaca'
    ) as unread_count,
    cm.is_archived,
    c.is_dispute,
    c.is_locked
  from conversation_members cm
  join conversations c on c.id = cm.conversation_id
  left join jobs j on j.id = c.job_id
  left join digital_orders dord on dord.id = c.order_id
  left join digital_listings dl on dl.id = dord.listing_id
  left join digital_listings dl2 on dl2.id = c.listing_id
  left join conversation_members ocm on ocm.conversation_id = c.id and ocm.profile_id <> auth.uid()
  left join profiles op on op.id = ocm.profile_id
  left join lateral (
    select content, sender_id from messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where cm.profile_id = auth.uid()
    and cm.is_archived = p_archived
    and exists (select 1 from messages m3 where m3.conversation_id = c.id)
    and (cm.hidden_at is null or c.last_message_at > cm.hidden_at)
    and (
      p_search is null or btrim(p_search) = ''
      or op.full_name ilike '%' || p_search || '%'
      or coalesce(j.title, dl.title, dl2.title, '') ilike '%' || p_search || '%'
    )
  order by c.last_message_at desc;
$$ language sql stable security definer;
