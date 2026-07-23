-- =========================================================
-- KERJAHUB — MIGRATION 0052: POPUP NEGO MUNCUL SAAT "TANYA HARGA"
-- Jalankan SETELAH 0001-0051.
--
-- Sebelumnya (migrasi 0050), popup "Ada pesanan yang ingin bernegosiasi"
-- HANYA muncul setelah lawan bicara mengajukan NOMINAL lewat
-- send_nego_offer() (tombol nominal cepat di chat). Kalau lawan bicara
-- baru menekan tombol "Chat & Tanya Harga" (start_job_chat) dan mengetik
-- diskusi teks biasa -- BELUM mengajukan nominal -- pemilik postingan
-- tidak dapat pop-up apa pun, harus sadar sendiri lewat menu Chat Saya.
--
-- FIX: start_job_chat() sekarang menandai percakapan sebagai "ada yang
-- bertanya harga, belum dilihat" untuk postingan harga-nego, TERLEPAS
-- dari ada nominal atau belum. get_pending_nego_popup() diperluas untuk
-- ikut mengembalikan inquiry semacam ini (kind='inquiry', amount=null)
-- selain tawaran nominal yang sudah ada (kind='offer', prioritas lebih
-- tinggi kalau dua-duanya ada di percakapan yang sama).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom penanda di conversations: ada yang tanya harga, belum dilihat
--    Default TRUE (bukan "perlu perhatian") supaya percakapan lama yang
--    sudah ada sebelum migrasi ini tidak tiba-tiba memunculkan popup.
-- ---------------------------------------------------------
alter table conversations add column if not exists nego_inquiry_seen boolean not null default true;
alter table conversations add column if not exists nego_inquiry_at timestamptz;

-- ---------------------------------------------------------
-- 2) start_job_chat(): tandai "belum dilihat" setiap kali peminat
--    membuka/klik chat untuk postingan harga-nego (baik percakapan baru
--    maupun yang sudah ada sebelumnya).
-- ---------------------------------------------------------
create or replace function public.start_job_chat(p_job_id uuid)
returns uuid as $$
declare
  v_employer_id uuid;
  v_is_nego boolean;
  v_conversation_id uuid;
begin
  select employer_id, is_nego into v_employer_id, v_is_nego from jobs where id = p_job_id;
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

  if v_is_nego then
    update conversations
    set nego_inquiry_seen = false, nego_inquiry_at = now()
    where id = v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 3) get_pending_nego_popup(): sekarang mengembalikan kolom `kind` dan
--    `amount` boleh null -- gabungan tawaran nominal (kind='offer') dan
--    sekadar "tanya harga" tanpa nominal (kind='inquiry'). Tawaran
--    nominal diprioritaskan kalau dua-duanya ada di percakapan yang sama.
-- ---------------------------------------------------------
drop function if exists public.get_pending_nego_popup();

create or replace function public.get_pending_nego_popup()
returns table (
  kind text,
  offer_id uuid,
  conversation_id uuid,
  job_id uuid,
  job_title text,
  amount numeric,
  created_at timestamptz,
  offerer_id uuid,
  offerer_name text,
  offerer_avatar text
) as $$
  select kind, offer_id, conversation_id, job_id, job_title, amount, created_at, offerer_id, offerer_name, offerer_avatar
  from (
    (
      select
        'offer' as kind,
        no.id as offer_id,
        no.conversation_id,
        j.id as job_id,
        j.title as job_title,
        no.amount,
        no.created_at,
        p.id as offerer_id,
        p.full_name as offerer_name,
        p.avatar_url as offerer_avatar
      from nego_offers no
      join jobs j on j.id = no.job_id
      join profiles p on p.id = no.offered_by
      where j.employer_id = auth.uid()
        and no.offered_by <> auth.uid()
        and no.status = 'menunggu'
        and no.seen_by_poster = false
    )
    union all
    (
      select
        'inquiry' as kind,
        null::uuid as offer_id,
        c.id as conversation_id,
        j.id as job_id,
        j.title as job_title,
        null::numeric as amount,
        c.nego_inquiry_at as created_at,
        p.id as offerer_id,
        p.full_name as offerer_name,
        p.avatar_url as offerer_avatar
      from conversations c
      join jobs j on j.id = c.job_id
      join profiles p on p.id = c.worker_id
      where c.source_type = 'job'
        and j.employer_id = auth.uid()
        and c.worker_id <> auth.uid()
        and j.is_nego = true
        and j.stage = 'terbuka'
        and c.nego_inquiry_seen = false
        and not exists (
          select 1 from nego_offers no2
          where no2.conversation_id = c.id and no2.status = 'menunggu' and no2.seen_by_poster = false
        )
    )
  ) combined
  order by (kind = 'offer') desc, created_at asc
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_pending_nego_popup() to authenticated;

-- ---------------------------------------------------------
-- 4) dismiss_nego_inquiry_popup(): tutup popup versi "tanya harga"
--    (belum ada nominal) tanpa mengubah apa pun selain flag terlihat.
-- ---------------------------------------------------------
create or replace function public.dismiss_nego_inquiry_popup(p_conversation_id uuid)
returns void as $$
declare
  v_employer_id uuid;
begin
  select j.employer_id into v_employer_id
  from conversations c join jobs j on j.id = c.job_id
  where c.id = p_conversation_id;

  if v_employer_id is null then raise exception 'Percakapan tidak ditemukan'; end if;
  if v_employer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update conversations set nego_inquiry_seen = true where id = p_conversation_id;
end;
$$ language plpgsql security definer;

grant execute on function public.dismiss_nego_inquiry_popup(uuid) to authenticated;
