-- =========================================================
-- KERJAHUB — MIGRATION 0011: PERBAIKI INFINITE RECURSION RLS
-- Jalankan SETELAH 0001-0010.
--
-- BUG: policy SELECT lama di `conversation_members`
-- (migration 0006) melakukan subquery ke `conversation_members`
-- itu sendiri:
--   conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
-- Setiap kali Postgres mengevaluasi RLS untuk tabel ini, ia harus
-- menjalankan subquery itu, yang tunduk pada policy yang sama lagi
-- -> "infinite recursion detected in policy for relation
-- conversation_members". Ini menggagalkan SEMUA query yang
-- menyentuh conversation_members, termasuk (transitif lewat
-- policy lain) messages, attachments, message_reads, conversations
-- — makanya chat sama sekali tidak bisa dibuka.
--
-- FIX: cek keanggotaan lewat fungsi SECURITY DEFINER (pola yang
-- sama dipakai public.is_admin()). Fungsi security definer
-- berjalan dengan hak akses pemiliknya sehingga TIDAK tunduk pada
-- RLS tabel yang sama, jadi tidak ada rekursi.
-- =========================================================

create or replace function public.my_conversation_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select conversation_id from conversation_members where profile_id = auth.uid();
$$;

drop policy if exists "Anggota bisa lihat keanggotaan percakapannya" on conversation_members;
create policy "Anggota bisa lihat keanggotaan percakapannya" on conversation_members
  for select using (
    profile_id = auth.uid()
    or conversation_id in (select public.my_conversation_ids())
    or public.is_admin()
  );
