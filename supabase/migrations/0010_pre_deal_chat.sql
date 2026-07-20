-- =========================================================
-- KERJAHUB — MIGRATION 0010: CHAT PRA-DEAL
-- Jalankan SETELAH 0001-0009.
--
-- Tujuan: memungkinkan calon pembeli/pelamar/klien mengobrol dulu
-- dengan pemilik postingan (lowongan kerja, tawaran jasa pekerja,
-- ATAU listing marketplace digital) SEBELUM melamar / mengajak kerja
-- sama / membuat order — untuk menanyakan ketersediaan, detail produk,
-- nego, dll. Percakapan ini otomatis menghubungkan kedua pihak dan
-- muncul di menu "Chat Saya" seperti percakapan lain.
--
-- Cakupan:
--   1. Percakapan job/jasa pra-lamaran: TIDAK butuh tabel baru — cukup
--      RPC start_job_chat() yang membuat baris `conversations`
--      (source_type='job') lebih awal, sebelum applications/acceptance
--      ada. Skema job_id/employer_id/worker_id sudah mendukung ini.
--   2. Percakapan listing marketplace pra-order: butuh kolom baru
--      `listing_id` + `initiator_id` di `conversations`, karena source
--      'marketplace' yang lama WAJIB terikat ke `digital_orders`.
--      Source baru 'listing' dipakai untuk chat pra-order ini.
--   3. RPC start_listing_chat() untuk memicu (2).
--   4. list_my_conversations() diperbarui supaya ikut menampilkan
--      judul & lawan bicara percakapan 'listing'.
-- =========================================================

-- ---------------------------------------------------------
-- 1) KOLOM BARU DI CONVERSATIONS
-- ---------------------------------------------------------
alter table conversations
  add column if not exists listing_id uuid references digital_listings(id) on delete cascade,
  add column if not exists initiator_id uuid references profiles(id) on delete cascade;

-- ---------------------------------------------------------
-- 2) PERLUAS source_type CHECK: tambahkan opsi 'listing'
-- ---------------------------------------------------------
alter table conversations drop constraint if exists conversations_source_type_check;
alter table conversations
  add constraint conversations_source_type_check check (source_type in ('job', 'marketplace', 'listing'));

alter table conversations drop constraint if exists conversations_source_check;
alter table conversations
  add constraint conversations_source_check check (
    (source_type = 'job' and job_id is not null and order_id is null and listing_id is null)
    or (source_type = 'marketplace' and order_id is not null and job_id is null and listing_id is null)
    or (source_type = 'listing' and listing_id is not null and job_id is null and order_id is null and initiator_id is not null)
  );

-- satu percakapan pra-order per (listing, orang yang memulai chat)
create unique index if not exists conversations_listing_initiator_unique_idx
  on conversations(listing_id, initiator_id) where listing_id is not null;

-- ---------------------------------------------------------
-- 3) TRIGGER populate_conversation_members: tambah kasus 'listing'
-- ---------------------------------------------------------
create or replace function public.populate_conversation_members()
returns trigger as $$
begin
  if new.source_type = 'job' then
    insert into conversation_members (conversation_id, profile_id)
    values (new.id, new.employer_id), (new.id, new.worker_id)
    on conflict (conversation_id, profile_id) do nothing;
  elsif new.source_type = 'marketplace' then
    insert into conversation_members (conversation_id, profile_id)
    select new.id, o.buyer_id from digital_orders o where o.id = new.order_id
    union
    select new.id, o.seller_id from digital_orders o where o.id = new.order_id
    on conflict (conversation_id, profile_id) do nothing;
  elsif new.source_type = 'listing' then
    insert into conversation_members (conversation_id, profile_id)
    values (new.id, new.initiator_id)
    on conflict (conversation_id, profile_id) do nothing;

    insert into conversation_members (conversation_id, profile_id)
    select new.id, l.seller_id from digital_listings l where l.id = new.listing_id
    on conflict (conversation_id, profile_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 4) RLS conversations: izinkan insert oleh initiator (chat listing)
-- ---------------------------------------------------------
drop policy if exists "Sistem buat percakapan lewat fungsi/trigger" on conversations;
create policy "Sistem buat percakapan lewat fungsi/trigger" on conversations
  for insert with check (
    auth.uid() = employer_id
    or auth.uid() = worker_id
    or auth.uid() = initiator_id
    or public.is_admin()
  );

-- ---------------------------------------------------------
-- 5) RPC: start_job_chat — mulai/ambil chat pra-lamaran utk job & jasa
--    Dipanggil oleh calon pelamar (job) atau calon klien (tawaran jasa
--    worker), SEBELUM applications dibuat.
-- ---------------------------------------------------------
create or replace function public.start_job_chat(p_job_id uuid)
returns uuid as $$
declare
  v_employer_id uuid;
  v_conversation_id uuid;
begin
  select employer_id into v_employer_id from jobs where id = p_job_id;
  if v_employer_id is null then
    raise exception 'Postingan tidak ditemukan';
  end if;
  if v_employer_id = auth.uid() then
    raise exception 'Tidak bisa memulai chat dengan postingan milik sendiri';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  insert into conversations (source_type, job_id, employer_id, worker_id)
  values ('job', p_job_id, v_employer_id, auth.uid())
  on conflict (job_id, worker_id) do nothing;

  select id into v_conversation_id
  from conversations
  where job_id = p_job_id and worker_id = auth.uid() and employer_id = v_employer_id
  order by created_at desc
  limit 1;

  return v_conversation_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 6) RPC: start_listing_chat — mulai/ambil chat pra-order utk listing
--    marketplace digital. Dipanggil oleh calon pembeli SEBELUM order
--    dibuat, mis. menanyakan ketersediaan/detail produk ke penjual.
-- ---------------------------------------------------------
create or replace function public.start_listing_chat(p_listing_id uuid)
returns uuid as $$
declare
  v_seller_id uuid;
  v_conversation_id uuid;
begin
  select seller_id into v_seller_id from digital_listings where id = p_listing_id;
  if v_seller_id is null then
    raise exception 'Listing tidak ditemukan';
  end if;
  if v_seller_id = auth.uid() then
    raise exception 'Tidak bisa memulai chat dengan listing milik sendiri';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  insert into conversations (source_type, listing_id, initiator_id)
  values ('listing', p_listing_id, auth.uid())
  on conflict (listing_id, initiator_id) where listing_id is not null do nothing;

  select id into v_conversation_id
  from conversations
  where listing_id = p_listing_id and initiator_id = auth.uid()
  order by created_at desc
  limit 1;

  return v_conversation_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 7) list_my_conversations: kenali judul & lawan bicara utk 'listing'
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
    and (
      p_search is null or btrim(p_search) = ''
      or op.full_name ilike '%' || p_search || '%'
      or coalesce(j.title, dl.title, dl2.title, '') ilike '%' || p_search || '%'
    )
  order by c.last_message_at desc;
$$ language sql stable security definer;
