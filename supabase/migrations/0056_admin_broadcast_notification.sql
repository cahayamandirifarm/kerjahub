-- =========================================================
-- KERJAHUB — MIGRATION 0055: BROADCAST NOTIFIKASI OLEH ADMIN
--
-- CATATAN NOMOR FILE: sesuaikan urutan angka file ini kalau di folder
-- migrations kamu nomor 0055 sudah dipakai file lain -- yang penting
-- dijalankan PALING TERAKHIR (setelah semua migration lain, termasuk
-- 0054).
--
-- Fitur: admin bisa kirim notifikasi (judul + isi + link opsional) ke
-- SEMUA pengguna sekaligus (atau dipersempit ke Pemberi Kerja / Pekerja
-- saja) langsung dari admin panel. Tiap penerima dapat baris baru di
-- tabel `notifications` seperti notifikasi biasa -- otomatis muncul di
-- lonceng notifikasi in-app DAN memicu push+badge lewat jalur yang
-- sudah ada (trg_notify_push_for_notification, migrasi 0044), tanpa
-- perlu kode tambahan apa pun untuk push-nya.
-- =========================================================

create or replace function public.admin_broadcast_notification(
  p_title text,
  p_body text default null,
  p_link text default null,
  p_target text default 'semua' -- 'semua' | 'employer' | 'worker'
)
returns integer as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Tidak berhak';
  end if;
  if p_title is null or trim(p_title) = '' then
    raise exception 'Judul notifikasi wajib diisi';
  end if;
  if p_target not in ('semua', 'employer', 'worker') then
    raise exception 'Target tidak valid';
  end if;

  insert into notifications (profile_id, title, body, link, category)
  select p.id, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), nullif(trim(coalesce(p_link, '')), ''), 'pengumuman'
  from profiles p
  where p.role <> 'admin'
    and p.is_suspended = false
    and (p_target = 'semua' or p.role::text = p_target);

  get diagnostics v_count = row_count;

  perform public.write_audit('admin_broadcast_notification', 'notifications', null,
    jsonb_build_object('title', p_title, 'target', p_target, 'recipient_count', v_count));

  return v_count;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_broadcast_notification(text, text, text, text) to authenticated;
