-- =========================================================
-- KERJAHUB — MIGRATION 0040: FITUR EDIT SALDO OLEH SUPERADMIN
--
-- CATATAN ARSIP: fungsi ini sudah dijalankan manual lewat SQL Editor
-- di database live pada 22 Jul 2026, sebelum file migration ini dibuat.
-- File ini hanya untuk dokumentasi/riwayat -- BUKAN untuk dijalankan
-- lewat `supabase db push`, karena migration 0001-0039 di folder ini
-- belum pernah di-push ke project live (project live saat ini disusun
-- manual lewat SQL Editor, termasuk RLS dasarnya). Jalankan `db push`
-- hanya setelah riwayat migration lokal direkonsiliasi dengan skema
-- live, supaya tidak mencoba create table/type yang sudah ada.
--
-- FITUR: admin panel (/admin/users) punya tombol "Edit Saldo" yang
-- hanya tampil untuk 1 akun superadmin (dicek lewat UUID tetap, bukan
-- role/username, supaya tidak rapuh kalau username berubah). Menambah
-- atau mengurangi wallet_balance milik user manapun, sekaligus
-- mencatat jejaknya di wallet_transactions & audit_log supaya bisa
-- diaudit siapa yang mengubah, kapan, dan kenapa.
-- =========================================================

create or replace function public.admin_adjust_balance(
  _target_user_id uuid,
  _amount numeric,       -- positif untuk nambah, negatif untuk kurangi
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Hanya UUID superadmin ini yang boleh menjalankan fungsi.
  -- Sengaja dikunci ke UUID tetap (bukan role='admin' atau username),
  -- supaya tidak ikut terbuka untuk admin lain, dan tidak rapuh kalau
  -- username 'superadmin' suatu saat diganti.
  if auth.uid() != '7eb76528-7597-4bbb-9d5a-e166202b38f8' then
    raise exception 'Hanya akun superadmin yang boleh mengubah saldo';
  end if;

  update profiles
  set wallet_balance = coalesce(wallet_balance, 0) + _amount
  where id = _target_user_id;

  if not found then
    raise exception 'User tidak ditemukan';
  end if;

  if (select wallet_balance from profiles where id = _target_user_id) < 0 then
    raise exception 'Saldo tidak boleh minus';
  end if;

  insert into wallet_transactions (user_id, type, amount, note)
  values (
    _target_user_id,
    case when _amount >= 0 then 'deposit' else 'penarikan' end,
    _amount,
    coalesce(_note, 'Penyesuaian saldo oleh superadmin')
  );

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (
    auth.uid(),
    'admin_adjust_balance',
    'profiles',
    _target_user_id,
    jsonb_build_object('amount', _amount, 'note', _note)
  );
end;
$$;

grant execute on function public.admin_adjust_balance(uuid, numeric, text) to authenticated;
