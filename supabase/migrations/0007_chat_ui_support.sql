-- =========================================================
-- KERJAHUB — MIGRATION 0007: HELPER UNTUK UI CHAT (Fase 2)
-- Jalankan SETELAH 0006_chat_system.sql.
--
-- Tidak ada perubahan tabel besar di sini — cuma:
--   - RPC list_my_conversations(): daftar percakapan siap-pakai untuk
--     halaman /chat (sudah termasuk lawan bicara, pesan terakhir,
--     unread count, judul job/listing) biar UI tidak perlu N+1 query.
--   - RPC my_unread_chat_count(): total badge unread untuk navbar.
--   - Backfill percakapan marketplace untuk order yang sudah ada
--     SEBELUM migrasi 0006 (order baru sudah otomatis lewat trigger).
-- =========================================================

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
    coalesce(j.title, dl.title, 'Percakapan') as title,
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
    and (
      p_search is null or btrim(p_search) = ''
      or op.full_name ilike '%' || p_search || '%'
      or coalesce(j.title, dl.title, '') ilike '%' || p_search || '%'
    )
  order by c.last_message_at desc;
$$ language sql stable security definer;

create or replace function public.my_unread_chat_count()
returns bigint as $$
  select count(*)::bigint from message_reads mr
  join messages m on m.id = mr.message_id
  join conversation_members cm on cm.conversation_id = m.conversation_id and cm.profile_id = auth.uid()
  where mr.profile_id = auth.uid() and mr.status <> 'dibaca' and cm.is_archived = false;
$$ language sql stable security definer;

-- backfill: order marketplace lama (sebelum 0006) belum punya percakapan
insert into conversations (source_type, order_id)
select 'marketplace', d.id
from digital_orders d
where not exists (select 1 from conversations c where c.order_id = d.id)
on conflict (order_id) where order_id is not null do nothing;
