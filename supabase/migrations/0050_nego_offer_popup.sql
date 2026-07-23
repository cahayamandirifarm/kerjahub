-- =========================================================
-- KERJAHUB — MIGRATION 0050: POPUP TAWARAN NEGO BARU
-- Jalankan SETELAH 0001-0049.
--
-- Fitur: kalau ada peminat yang mengajukan tawaran harga (nego_offers)
-- ke postingan harga-nego milik seseorang, pemilik postingan
-- (jobs.employer_id) akan melihat popup begitu membuka/refresh app --
-- "Ada pesanan yang ingin bernegosiasi" -- dengan tombol "Lihat
-- Sekarang" yang langsung mengarahkan ke percakapan (bubble chat)
-- terkait. Pola & penamaannya sengaja dibuat konsisten dengan popup
-- pelamar baru (migrasi 0029): seen_by_poster + get_pending_* +
-- dismiss_*.
--
-- CATATAN: tawaran yang muncul di popup HANYA yang diajukan LAWAN
-- bicara (offered_by <> auth.uid()) -- tawaran balasan yang pemilik
-- postingan kirim sendiri tidak memunculkan popup ke pemilik itu
-- sendiri.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom penanda "sudah dilihat pemilik postingan"
-- ---------------------------------------------------------
alter table nego_offers add column if not exists seen_by_poster boolean not null default false;

-- ---------------------------------------------------------
-- 2) get_pending_nego_popup(): satu tawaran tertua yang belum
--    dilihat, untuk salah satu postingan milik pengguna yang login
-- ---------------------------------------------------------
create or replace function public.get_pending_nego_popup()
returns table (
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
  select
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
  order by no.created_at asc
  limit 1;
$$ language sql stable security definer;

grant execute on function public.get_pending_nego_popup() to authenticated;

-- ---------------------------------------------------------
-- 3) dismiss_nego_offer_popup(): tutup popup tanpa memutuskan --
--    tawarannya sendiri tetap 'menunggu' dan tetap bisa dijawab dari
--    dalam chat, cuma popup-nya saja yang tidak muncul lagi berulang.
-- ---------------------------------------------------------
create or replace function public.dismiss_nego_offer_popup(p_offer_id uuid)
returns void as $$
declare
  v_job_employer uuid;
begin
  select j.employer_id into v_job_employer
  from nego_offers no join jobs j on j.id = no.job_id
  where no.id = p_offer_id;

  if v_job_employer is null then raise exception 'Tawaran tidak ditemukan'; end if;
  if v_job_employer <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update nego_offers set seen_by_poster = true where id = p_offer_id;
end;
$$ language plpgsql security definer;

grant execute on function public.dismiss_nego_offer_popup(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4) Realtime: nego_offers sudah ada di publication supabase_realtime
--    sejak migrasi 0048, jadi INSERT/UPDATE tawaran baru langsung
--    kedengaran oleh context popup di client tanpa perlu tambahan.
-- =========================================================
