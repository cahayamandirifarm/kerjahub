-- =========================================================
-- KERJAHUB — MIGRATION 0008: ADMIN CHAT & DASHBOARD SENGKETA (Fase 3)
-- Jalankan SETELAH 0006 dan 0007.
--
--   - Perketat kebijakan insert conversation_members (di 0006 sempat
--     terlalu longgar "with check (true)") — sekarang hanya trigger
--     security definer ATAU admin yang menambahkan baris sendiri.
--   - Izinkan admin mengirim pesan ke percakapan manapun (dulu hanya
--     anggota percakapan yang boleh insert ke `messages`).
--   - RPC admin_join_conversation(): admin resmi "bergabung" ke sebuah
--     percakapan (jadi tercatat sebagai member berperan admin, dapat
--     dibedakan di bubble chat), set status sengketa jadi Diproses,
--     posting pesan sistem, dan tercatat di audit log.
-- =========================================================

drop policy if exists "Sistem/admin insert keanggotaan" on conversation_members;
create policy "Admin bisa insert keanggotaan admin untuk dirinya" on conversation_members
  for insert with check (
    public.is_admin() and member_role = 'admin' and profile_id = auth.uid()
  );
-- catatan: insert untuk peserta biasa (participant) tetap dilakukan lewat
-- trigger `populate_conversation_members` yang security definer, sehingga
-- otomatis melewati RLS ini — policy di atas hanya menjaga insert langsung
-- dari client.

drop policy if exists "Anggota yang tidak diblokir bisa kirim pesan" on messages;
create policy "Anggota (tidak diblokir) atau admin bisa kirim pesan" on messages
  for insert with check (
    auth.uid() = sender_id
    and (
      public.is_admin()
      or (
        conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
        and not exists (
          select 1 from conversation_members cm
          join blocked_users b on b.blocker_id = cm.profile_id and b.blocked_id = auth.uid()
          where cm.conversation_id = messages.conversation_id and cm.profile_id <> auth.uid()
        )
      )
    )
  );

create or replace function public.admin_join_conversation(p_conversation_id uuid)
returns void as $$
declare
  v_admin_name text;
  v_already_joined boolean;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa bergabung lewat fungsi ini';
  end if;

  select exists(
    select 1 from conversation_members where conversation_id = p_conversation_id and profile_id = auth.uid()
  ) into v_already_joined;

  if v_already_joined then
    return;
  end if;

  insert into conversation_members (conversation_id, profile_id, member_role)
  values (p_conversation_id, auth.uid(), 'admin');

  select full_name into v_admin_name from profiles where id = auth.uid();

  insert into messages (conversation_id, sender_id, content, message_type, is_system)
  values (p_conversation_id, auth.uid(), coalesce(v_admin_name, 'Admin') || ' telah bergabung ke percakapan ini.', 'system', true);

  update disputes
  set status = 'diproses', assigned_admin_id = coalesce(assigned_admin_id, auth.uid()), updated_at = now()
  where conversation_id = p_conversation_id and status = 'menunggu_admin';

  perform public.write_audit('admin_join_conversation', 'conversations', p_conversation_id, '{}'::jsonb);
end;
$$ language plpgsql security definer;
