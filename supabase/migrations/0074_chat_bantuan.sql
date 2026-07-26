-- =========================================================
-- KERJAHUB — MIGRATION 0074: CHAT BANTUAN (SUPPORT CHAT KE ADMIN)
-- + TEMPLATE PESAN OTOMATIS SENGKETA /tanyaadmin
-- Jalankan SETELAH 0001-0073.
--
-- BAGIAN A — CHAT BANTUAN
-- Menambah source_type baru 'bantuan' pada `conversations`: 1 percakapan
-- permanen per pengguna <-> admin platform (dipakai buat pertanyaan
-- umum/kendala akun/dsb, DI LUAR sengketa transaksi job/marketplace yang
-- sudah ada lewat /tanyaadmin). Mengikuti pola yang PERSIS sama dengan
-- source_type 'listing' di migration 0010 (kolom `initiator_id` yang
-- sudah ada dipakai lagi, bukan bikin kolom baru):
--   - RPC start_bantuan_chat(): ambil/bikin percakapan bantuan milik
--     pengguna yang login, dipanggil dari kartu "Chat Bantuan" yang
--     ditampilkan FIXED di posisi paling atas menu Chat semua pengguna
--     (dirender di client, tidak butuh baris DB dulu supaya tidak perlu
--     pre-provision jutaan percakapan kosong).
--   - RPC get_my_bantuan_summary(): preview pesan terakhir & unread
--     count buat kartu itu, tanpa ikut nyampur ke list_my_conversations
--     biasa (supaya tidak dobel & selalu bisa dipin terpisah di UI).
--   - Admin membalas lewat halaman admin/chats/[id] yang SUDAH ADA
--     (generic, jalan untuk semua source_type), pakai RPC
--     admin_join_conversation() yang juga SUDAH ADA sejak 0008 — tidak
--     ada perubahan di sisi itu. Selama belum ada admin yang join,
--     SETIAP pesan baru dari pengguna di chat bantuan me-notifikasi
--     ulang SEMUA admin (sama seperti alur /tanyaadmin), supaya
--     permintaan yang belum ditangani tidak kelewat.
--
-- BAGIAN B — TEMPLATE PESAN /tanyaadmin
-- Pesan sistem otomatis saat /tanyaadmin dipicu (migration 0006)
-- sebelumnya cuma satu kalimat generik. Diganti jadi template yang
-- beda untuk sengketa job (pemberi upah <-> penerima upah) vs
-- marketplace (penjual <-> pembeli), berisi langkah & bukti yang perlu
-- disiapkan kedua pihak. Bubble pesan sistem yang panjang/multi-baris
-- otomatis dirender sebagai kartu (bukan pill kecil) di frontend —
-- lihat perubahan di app/chat/[conversationId]/page.tsx.
-- =========================================================

-- ---------------------------------------------------------
-- 1) source_type: tambahkan 'bantuan'
-- ---------------------------------------------------------
alter table conversations drop constraint if exists conversations_source_type_check;
alter table conversations
  add constraint conversations_source_type_check check (source_type in ('job', 'marketplace', 'listing', 'bantuan'));

alter table conversations drop constraint if exists conversations_source_check;
alter table conversations
  add constraint conversations_source_check check (
    (source_type = 'job' and job_id is not null and order_id is null and listing_id is null)
    or (source_type = 'marketplace' and order_id is not null and job_id is null and listing_id is null)
    or (source_type = 'listing' and listing_id is not null and job_id is null and order_id is null and initiator_id is not null)
    or (source_type = 'bantuan' and initiator_id is not null and job_id is null and order_id is null and listing_id is null)
  );

-- Satu percakapan bantuan per pengguna (dipakai berulang setiap kali
-- dia butuh bantuan lagi -- bukan bikin tiket baru tiap kali).
create unique index if not exists conversations_bantuan_initiator_unique_idx
  on conversations(initiator_id) where source_type = 'bantuan';

-- ---------------------------------------------------------
-- 2) populate_conversation_members: tambah kasus 'bantuan'
--    (hanya pengguna yang jadi anggota di awal; admin baru masuk
--    belakangan lewat admin_join_conversation() saat membalas)
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
  elsif new.source_type = 'bantuan' then
    insert into conversation_members (conversation_id, profile_id)
    values (new.id, new.initiator_id)
    on conflict (conversation_id, profile_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- (RLS insert conversations sudah mengizinkan auth.uid() = initiator_id
-- sejak migration 0010, jadi otomatis berlaku juga untuk 'bantuan' --
-- tidak perlu policy baru.)

-- ---------------------------------------------------------
-- 3) RPC: start_bantuan_chat — ambil/bikin percakapan bantuan
--    milik pengguna yang login.
-- ---------------------------------------------------------
create or replace function public.start_bantuan_chat()
returns uuid as $$
declare
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Harus login';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  insert into conversations (source_type, initiator_id)
  values ('bantuan', auth.uid())
  on conflict (initiator_id) where source_type = 'bantuan' do nothing;

  select id into v_conversation_id
  from conversations
  where source_type = 'bantuan' and initiator_id = auth.uid()
  limit 1;

  -- Pesan pembuka otomatis, cuma sekali saat percakapan ini baru dibuat.
  if not exists (select 1 from messages where conversation_id = v_conversation_id) then
    insert into messages (conversation_id, sender_id, content, message_type, is_system)
    values (
      v_conversation_id, auth.uid(),
      'Ini chat bantuan resmi ke Admin KerjaHub. Ceritakan kendala kamu di sini (akun, transaksi, penarikan dana, dll) — tim kami akan membalas secepatnya di jam kerja.',
      'system', true
    );
  end if;

  return v_conversation_id;
end;
$$ language plpgsql security definer;

grant execute on function public.start_bantuan_chat() to authenticated;

-- ---------------------------------------------------------
-- 4) RPC: get_my_bantuan_summary — preview buat kartu "Chat Bantuan"
--    yang dipin di paling atas menu Chat. Baris kosong (belum pernah
--    mulai chat bantuan) sengaja TIDAK dikembalikan -- klien menampilkan
--    kartu itu terlepas dari ada/tidaknya baris ini.
-- ---------------------------------------------------------
create or replace function public.get_my_bantuan_summary()
returns table (
  conversation_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
) as $$
  select
    c.id,
    lm.content,
    c.last_message_at,
    (
      select count(*) from message_reads mr
      join messages m2 on m2.id = mr.message_id
      where m2.conversation_id = c.id and mr.profile_id = auth.uid() and mr.status <> 'dibaca'
    ) as unread_count
  from conversations c
  left join lateral (
    select content from messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.source_type = 'bantuan' and c.initiator_id = auth.uid()
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_my_bantuan_summary() to authenticated;

-- ---------------------------------------------------------
-- 5) list_my_conversations: kecualikan 'bantuan' dari daftar biasa
--    (ditampilkan terpisah & selalu dipin lewat get_my_bantuan_summary,
--    supaya tidak dobel muncul di daftar chat aktif/arsip).
--    Selebihnya IDENTIK dengan versi 0038.
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
    and c.source_type <> 'bantuan'
    and exists (select 1 from messages m3 where m3.conversation_id = c.id)
    and (cm.hidden_at is null or c.last_message_at > cm.hidden_at)
    and (
      p_search is null or btrim(p_search) = ''
      or op.full_name ilike '%' || p_search || '%'
      or coalesce(j.title, dl.title, dl2.title, '') ilike '%' || p_search || '%'
    )
  order by c.last_message_at desc;
$$ language sql stable security definer;

-- ---------------------------------------------------------
-- 6) handle_new_message: tambah notifikasi ke SEMUA admin selama chat
--    bantuan belum ada admin yang menangani (member admin) + ganti
--    template pesan /tanyaadmin jadi format sengketa yang lebih jelas.
--    Selebihnya IDENTIK dengan versi 0006.
-- ---------------------------------------------------------
create or replace function public.handle_new_message()
returns trigger as $$
declare
  v_dispute_id uuid;
  v_admin record;
  v_sender_name text;
  v_recipient record;
  v_source_type text;
begin
  select source_type into v_source_type from conversations where id = new.conversation_id;

  -- update last_message_at percakapan (kecuali pesan sistem kosong)
  update conversations set last_message_at = new.created_at where id = new.conversation_id;

  -- tandai status "terkirim" untuk semua anggota lain
  insert into message_reads (message_id, profile_id, status)
  select new.id, cm.profile_id, 'terkirim'
  from conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.profile_id <> new.sender_id
  on conflict (message_id, profile_id) do nothing;

  -- notifikasi in-app (toast + bunyi lewat NotificationContext, sekaligus
  -- jadi trigger push notification background lewat trg_notify_push_for_message
  -- yang membaca tabel `messages`, bukan `notifications`, jadi ini tidak dobel).
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

  -- Chat bantuan: selama belum ada admin yang bergabung sebagai anggota
  -- (belum ada yang menangani), tiap pesan baru dari pengguna terus
  -- menotifikasi SEMUA admin -- begitu satu admin admin_join_conversation(),
  -- dia otomatis jadi anggota & langsung kena jalur notifikasi biasa di
  -- atas, jadi loop ini otomatis berhenti tanpa perlu status terpisah.
  if not new.is_system and v_source_type = 'bantuan' and not exists (
    select 1 from profiles where id = new.sender_id and role = 'admin'
  ) and not exists (
    select 1 from conversation_members cm
    join profiles p on p.id = cm.profile_id
    where cm.conversation_id = new.conversation_id and p.role = 'admin'
  ) then
    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (profile_id, title, body, link, category)
      values (
        v_admin.id, 'Chat bantuan butuh admin',
        'Pengguna butuh bantuan dan belum ada admin yang menangani.',
        '/admin/chats/' || new.conversation_id, 'chat'
      );
    end loop;
  end if;

  if not new.is_system and left(trim(new.content), 11) = '/tanyaadmin' and v_source_type in ('job', 'marketplace') then
    insert into disputes (conversation_id, opened_by, trigger_message_id)
    values (new.conversation_id, new.sender_id, new.id)
    returning id into v_dispute_id;

    update conversations set is_dispute = true, is_locked = true where id = new.conversation_id;

    insert into messages (conversation_id, sender_id, content, message_type, is_system)
    values (
      new.conversation_id, new.sender_id,
      case v_source_type
        when 'job' then
          'Admin telah diminta bergabung untuk menengahi sengketa transaksi ini. Riwayat chat mulai saat ini menjadi bukti dan tidak dapat diubah.' || chr(10) || chr(10) ||
          'Agar admin bisa membantu lebih cepat, mohon PEMBERI UPAH dan PENERIMA UPAH menyiapkan:' || chr(10) ||
          '1. Bukti pekerjaan sudah/belum dikerjakan sesuai kesepakatan (foto, laporan, dsb).' || chr(10) ||
          '2. Penjelasan keberatan secara jelas dan spesifik.' || chr(10) ||
          '3. Tangkapan layar bukti pembayaran/transfer jika relevan.' || chr(10) || chr(10) ||
          'Admin akan meninjau riwayat percakapan ini dan membalas langsung di sini. Mohon tunggu dan jangan membuat percakapan/transaksi baru untuk masalah yang sama.'
        when 'marketplace' then
          'Admin telah diminta bergabung untuk menengahi sengketa transaksi ini. Riwayat chat mulai saat ini menjadi bukti dan tidak dapat diubah.' || chr(10) || chr(10) ||
          'Agar admin bisa membantu lebih cepat, mohon PENJUAL dan PEMBELI menyiapkan:' || chr(10) ||
          '1. Bukti produk digital sudah dikirim/diterima sesuai deskripsi.' || chr(10) ||
          '2. Penjelasan keberatan secara jelas dan spesifik (produk tidak sesuai, tidak diterima, dsb).' || chr(10) ||
          '3. Tangkapan layar bukti pembayaran/transfer jika relevan.' || chr(10) || chr(10) ||
          'Admin akan meninjau riwayat percakapan ini dan membalas langsung di sini. Mohon tunggu dan jangan membuat order baru untuk masalah yang sama.'
        else
          'Admin telah diminta bergabung ke percakapan ini untuk menangani sengketa. Riwayat chat mulai saat ini menjadi bukti dan tidak dapat diubah.'
      end,
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
