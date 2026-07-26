-- =========================================================
-- KERJAHUB — MIGRATION 0075: DAFTAR CHAT BANTUAN BELUM DITANGANI
-- Jalankan SETELAH 0001-0074.
--
-- RPC baru khusus admin: list_pending_bantuan_conversations(). Sebuah
-- percakapan 'bantuan' dianggap "belum ditangani" kalau belum ada admin
-- yang jadi conversation_members-nya (persis kondisi yang sama dipakai
-- trigger handle_new_message di 0074 untuk memutuskan apakah masih perlu
-- menotifikasi ulang semua admin) DAN sudah ada minimal 1 pesan asli dari
-- pengguna (bukan cuma pesan pembuka otomatis sistem).
--
-- Dipakai oleh bubble chat mengambang di admin panel (lihat
-- components/admin/BantuanFloatingBubble.tsx) supaya admin langsung
-- lihat + dapat notifikasi realtime begitu ada pengguna minta bantuan,
-- di halaman admin MANA PUN -- tidak perlu buka menu Monitoring Chat
-- dulu. Begitu satu admin admin_join_conversation() (sudah ada sejak
-- migration 0008), percakapan itu otomatis hilang dari daftar ini utk
-- SEMUA admin (karena sudah punya anggota admin), jadi tidak perlu
-- kolom status "sudah dilihat/klaim" terpisah.
-- =========================================================

create or replace function public.list_pending_bantuan_conversations()
returns table (
  conversation_id uuid,
  requester_id uuid,
  requester_name text,
  requester_avatar text,
  last_message text,
  last_message_at timestamptz
) as $$
  select
    c.id,
    p.id,
    p.full_name,
    p.avatar_url,
    lm.content,
    c.last_message_at
  from conversations c
  join conversation_members cm on cm.conversation_id = c.id
  join profiles p on p.id = cm.profile_id
  left join lateral (
    select content from messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.source_type = 'bantuan'
    and public.is_admin()
    and exists (select 1 from messages m2 where m2.conversation_id = c.id and not m2.is_system)
    and not exists (
      select 1 from conversation_members cm2
      join profiles p2 on p2.id = cm2.profile_id
      where cm2.conversation_id = c.id and p2.role = 'admin'
    )
  order by c.last_message_at desc
  limit 50;
$$ language sql stable security definer;

grant execute on function public.list_pending_bantuan_conversations() to authenticated;
