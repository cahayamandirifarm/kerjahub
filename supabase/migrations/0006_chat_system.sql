-- =========================================================
-- KERJAHUB — MIGRATION 0006: SISTEM CHAT LENGKAP
-- Jalankan SETELAH 0001, 0002, 0003, 0004, 0005.
--
-- Cakupan migrasi ini (Fase 1 — Schema & RLS):
--   - Perluas `conversations` agar mendukung chat Pemberi Kerja<->Pekerja
--     (job) DAN Pembeli<->Penjual (marketplace digital), bukan cuma job.
--   - `conversation_members`: sumber kebenaran keanggotaan percakapan,
--     status arsip per-user, dan last_read_at untuk unread badge.
--   - `message_reads`: status terkirim/diterima/dibaca per pesan per user.
--   - `attachments`: gambar/PDF/dokumen yang dikirim lewat Supabase Storage.
--   - `blocked_users`: blokir pengguna (memblokir kirim pesan baru).
--   - `disputes`: tiket sengketa yang dibuat lewat perintah /tanyaadmin
--     di dalam chat (terpisah dari `digital_disputes` yang sudah ada,
--     yang tetap dipakai untuk sengketa yang dibuka dari halaman order).
--   - Trigger otomatis: bikin percakapan saat order marketplace dibuat,
--     isi conversation_members otomatis, dan proses pesan /tanyaadmin.
--   - Kolom `messages` baru: reply, edit, soft-delete, tipe pesan, kunci
--     riwayat saat sengketa aktif.
--   - Storage bucket privat untuk lampiran chat.
--
-- CATATAN: file ini TIDAK mengubah UI. Fase 2 (UI chat) akan dibangun
-- di atas schema ini.
-- =========================================================

-- ---------------------------------------------------------
-- 1) CONVERSATIONS: generalisasi ke job & marketplace
-- ---------------------------------------------------------
alter table conversations
  add column if not exists source_type text not null default 'job'
    check (source_type in ('job', 'marketplace')),
  add column if not exists order_id uuid references digital_orders(id) on delete cascade,
  add column if not exists is_dispute boolean not null default false,
  add column if not exists is_locked boolean not null default false, -- true saat sengketa: riwayat jadi bukti, tidak boleh diubah
  add column if not exists last_message_at timestamptz not null default now();

-- employer_id/worker_id awalnya NOT NULL (skema lama cuma tahu job chat).
-- Longgarkan supaya percakapan marketplace (tanpa employer/worker) bisa dibuat;
-- kewajiban pengisian tetap dijaga lewat constraint di bawah.
alter table conversations alter column employer_id drop not null;
alter table conversations alter column worker_id drop not null;

-- job_id sudah ada & sudah nullable secara implisit lewat FK biasa; pastikan
-- percakapan selalu terikat ke job ATAU order, tidak boleh chat bebas.
alter table conversations
  drop constraint if exists conversations_source_check;
alter table conversations
  add constraint conversations_source_check check (
    (source_type = 'job' and job_id is not null and order_id is null)
    or (source_type = 'marketplace' and order_id is not null and job_id is null)
  );

-- unique constraint lama (job_id, worker_id) tetap berlaku untuk job.
-- tambahkan unique untuk 1 percakapan per order marketplace.
create unique index if not exists conversations_order_unique_idx
  on conversations(order_id) where order_id is not null;

create index if not exists conversations_last_message_idx on conversations(last_message_at desc);

-- ---------------------------------------------------------
-- 2) CONVERSATION_MEMBERS: keanggotaan, arsip per-user, unread tracking
-- ---------------------------------------------------------
create table if not exists conversation_members (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  member_role text not null default 'participant' check (member_role in ('participant', 'admin')),
  is_archived boolean not null default false,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (conversation_id, profile_id)
);
create index if not exists conversation_members_profile_idx on conversation_members(profile_id);
create index if not exists conversation_members_conv_idx on conversation_members(conversation_id);

alter table conversation_members enable row level security;

create policy "Anggota bisa lihat keanggotaan percakapannya" on conversation_members
  for select using (
    profile_id = auth.uid()
    or conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );
create policy "User bisa update baris keanggotaan sendiri (arsip, last_read)" on conversation_members
  for update using (profile_id = auth.uid() or public.is_admin());
create policy "Sistem/admin insert keanggotaan" on conversation_members
  for insert with check (true); -- diisi lewat trigger security definer & fungsi /tanyaadmin

-- ---------------------------------------------------------
-- 3) MESSAGES: reply, edit, soft-delete, tipe pesan, kunci saat sengketa
-- ---------------------------------------------------------
alter table messages
  add column if not exists reply_to_id uuid references messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'image', 'document', 'system')),
  add column if not exists is_system boolean not null default false;

create index if not exists messages_conversation_created_idx on messages(conversation_id, created_at desc);
create index if not exists messages_reply_to_idx on messages(reply_to_id);

-- ---------------------------------------------------------
-- 4) MESSAGE_READS: status terkirim / diterima / dibaca per pesan
-- ---------------------------------------------------------
create table if not exists message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'terkirim' check (status in ('terkirim', 'diterima', 'dibaca')),
  updated_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index if not exists message_reads_profile_idx on message_reads(profile_id);

alter table message_reads enable row level security;

create policy "Anggota percakapan bisa lihat status baca pesan" on message_reads
  for select using (
    message_id in (
      select m.id from messages m
      join conversation_members cm on cm.conversation_id = m.conversation_id
      where cm.profile_id = auth.uid()
    ) or public.is_admin()
  );
create policy "User set status baca/terima miliknya sendiri" on message_reads
  for insert with check (profile_id = auth.uid());
create policy "User update status baca/terima miliknya sendiri" on message_reads
  for update using (profile_id = auth.uid());

-- ---------------------------------------------------------
-- 5) ATTACHMENTS: gambar, PDF, dokumen (via Supabase Storage)
-- ---------------------------------------------------------
create table if not exists attachments (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  uploaded_by uuid not null references profiles(id),
  file_url text not null,
  file_name text not null,
  file_type text not null, -- 'image' | 'pdf' | 'document'
  file_size integer,
  created_at timestamptz not null default now()
);
create index if not exists attachments_conversation_idx on attachments(conversation_id);
create index if not exists attachments_message_idx on attachments(message_id);

alter table attachments enable row level security;

create policy "Anggota percakapan bisa lihat lampiran" on attachments
  for select using (
    conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );
create policy "Anggota percakapan bisa upload lampiran" on attachments
  for insert with check (
    uploaded_by = auth.uid()
    and conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
  );

-- ---------------------------------------------------------
-- 6) BLOCKED_USERS: blokir pengguna
-- ---------------------------------------------------------
create table if not exists blocked_users (
  id uuid primary key default uuid_generate_v4(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table blocked_users enable row level security;

create policy "User lihat daftar blokir miliknya" on blocked_users
  for select using (blocker_id = auth.uid() or public.is_admin());
create policy "User blokir orang lain" on blocked_users
  for insert with check (blocker_id = auth.uid());
create policy "User batalkan blokir miliknya" on blocked_users
  for delete using (blocker_id = auth.uid());

-- ---------------------------------------------------------
-- 7) DISPUTES: tiket sengketa dari perintah /tanyaadmin di chat
--    (terpisah dari digital_disputes yang dibuka dari halaman order)
-- ---------------------------------------------------------
create table if not exists disputes (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  opened_by uuid not null references profiles(id),
  trigger_message_id uuid references messages(id),
  status text not null default 'menunggu_admin'
    check (status in ('menunggu_admin', 'diproses', 'selesai', 'ditolak')),
  assigned_admin_id uuid references profiles(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists disputes_conversation_idx on disputes(conversation_id);
create index if not exists disputes_status_idx on disputes(status);

alter table disputes enable row level security;

create policy "Terlibat percakapan & admin bisa lihat sengketa" on disputes
  for select using (
    conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );
create policy "Hanya admin ubah status sengketa" on disputes
  for update using (public.is_admin());
create policy "Sistem buat sengketa lewat trigger" on disputes
  for insert with check (true); -- hanya dibuat lewat trigger security definer di bawah

-- ---------------------------------------------------------
-- 8) TRIGGER: auto-isi conversation_members saat conversation dibuat
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
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_populate_conversation_members on conversations;
create trigger trg_populate_conversation_members
  after insert on conversations
  for each row execute procedure public.populate_conversation_members();

-- ---------------------------------------------------------
-- 9) TRIGGER: auto-bikin percakapan marketplace saat order dibuat
-- ---------------------------------------------------------
create or replace function public.create_marketplace_conversation()
returns trigger as $$
begin
  insert into conversations (source_type, order_id)
  values ('marketplace', new.id)
  on conflict (order_id) where order_id is not null do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_create_marketplace_conversation on digital_orders;
create trigger trg_create_marketplace_conversation
  after insert on digital_orders
  for each row execute procedure public.create_marketplace_conversation();

-- ---------------------------------------------------------
-- 10) TRIGGER: pesan /tanyaadmin -> buat tiket sengketa + kunci riwayat
--     + notifikasi ke semua admin + pesan sistem "admin bergabung"
-- ---------------------------------------------------------
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

drop trigger if exists trg_handle_new_message on messages;
create trigger trg_handle_new_message
  after insert on messages
  for each row execute procedure public.handle_new_message();

-- ---------------------------------------------------------
-- 11) RPC: tandai percakapan sudah dibaca (dipanggil dari client saat buka chat)
-- ---------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void as $$
begin
  update conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and profile_id = auth.uid();

  update message_reads
  set status = 'dibaca', updated_at = now()
  where profile_id = auth.uid()
    and status <> 'dibaca'
    and message_id in (select id from messages where conversation_id = p_conversation_id);
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 12) RPC: admin resolve sengketa (set status + catatan)
-- ---------------------------------------------------------
create or replace function public.resolve_dispute(p_dispute_id uuid, p_status text, p_note text default null)
returns void as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa mengubah status sengketa';
  end if;
  if p_status not in ('diproses', 'selesai', 'ditolak') then
    raise exception 'Status tidak valid';
  end if;

  update disputes
  set status = p_status,
      resolution_note = coalesce(p_note, resolution_note),
      assigned_admin_id = coalesce(assigned_admin_id, auth.uid()),
      updated_at = now(),
      closed_at = case when p_status in ('selesai', 'ditolak') then now() else closed_at end
  where id = p_dispute_id;

  perform public.write_audit('resolve_dispute', 'disputes', p_dispute_id, jsonb_build_object('status', p_status));
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 13) UPDATE RLS lama untuk conversations & messages
--     (ganti kebijakan lama yang cuma tahu employer_id/worker_id)
-- ---------------------------------------------------------
drop policy if exists "Terlibat bisa lihat percakapan" on conversations;
drop policy if exists "Terlibat bisa buat percakapan" on conversations;
create policy "Anggota percakapan & admin bisa lihat percakapan" on conversations
  for select using (
    id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or auth.uid() = employer_id or auth.uid() = worker_id
    or public.is_admin()
  );
create policy "Sistem buat percakapan lewat fungsi/trigger" on conversations
  for insert with check (auth.uid() = employer_id or auth.uid() = worker_id or public.is_admin());
create policy "Anggota bisa update percakapan (arsip lama/dispute flag)" on conversations
  for update using (
    id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "Terlibat bisa lihat pesan" on messages;
drop policy if exists "Terlibat bisa kirim pesan" on messages;
create policy "Anggota percakapan & admin bisa lihat pesan" on messages
  for select using (
    conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );
create policy "Anggota yang tidak diblokir bisa kirim pesan" on messages
  for insert with check (
    auth.uid() = sender_id
    and conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    and not exists (
      -- lawan bicara sudah memblokir pengirim
      select 1 from conversation_members cm
      join blocked_users b on b.blocker_id = cm.profile_id and b.blocked_id = auth.uid()
      where cm.conversation_id = messages.conversation_id and cm.profile_id <> auth.uid()
    )
  );
create policy "Pengirim bisa edit pesan sendiri jika percakapan tidak terkunci" on messages
  for update using (
    auth.uid() = sender_id
    and not is_system
    and not exists (select 1 from conversations c where c.id = messages.conversation_id and c.is_locked)
  ) with check (
    auth.uid() = sender_id and not is_system
  );

-- ---------------------------------------------------------
-- 14) STORAGE: bucket privat untuk lampiran chat
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

-- konvensi path: {conversation_id}/{filename} — akses dicek lewat keanggotaan percakapan
create policy "Anggota percakapan bisa lihat lampiran chat" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and (
      (storage.foldername(name))[1] in (
        select conversation_id::text from conversation_members where profile_id = auth.uid()
      )
      or public.is_admin()
    )
  );
create policy "Anggota percakapan bisa upload lampiran chat" on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] in (
      select conversation_id::text from conversation_members where profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------
-- 15) REALTIME: pastikan tabel chat ada di publication supabase_realtime
-- ---------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_reads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.disputes;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------
-- 16) BACKFILL: isi conversation_members untuk percakapan job yang sudah ada
-- ---------------------------------------------------------
insert into conversation_members (conversation_id, profile_id)
select id, employer_id from conversations where source_type = 'job'
union
select id, worker_id from conversations where source_type = 'job'
on conflict (conversation_id, profile_id) do nothing;
