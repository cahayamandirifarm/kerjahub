-- =========================================================
-- Fitur admin: "Hapus Pengguna Permanen".
--
-- Menghapus baris auth.users otomatis men-cascade ke profiles dan semua
-- tabel yang sudah punya FK "on delete cascade" ke profiles(id):
-- transactions, conversations (job), notifications, topup_requests,
-- wallet_transactions, digital_listings, conversation_members,
-- message_reads, blocked_users, push_subscriptions, dsb.
--
-- Tapi ada beberapa tabel yang FK-nya SENGAJA tidak cascade karena
-- baris itu melibatkan DUA pihak (rating, escrow, order marketplace) --
-- menghapusnya begitu saja akan menghancurkan riwayat transaksi/ulasan
-- milik pihak lain juga. Untuk kasus itu, penghapusan permanen DITOLAK
-- dan admin diarahkan memakai "Tangguhkan" saja.
--
-- Pengguna yang aman dihapus permanen = belum pernah masuk tahap
-- escrow/rating/order marketplace, dan saldo dompetnya Rp 0.
-- =========================================================

create or replace function public.admin_delete_user_permanent(p_user_id uuid)
returns void as $$
declare
  v_caller_is_admin boolean;
  v_target_role user_role;
  v_target_username text;
  v_wallet_balance numeric;
  v_has_escrow boolean;
  v_has_ratings boolean;
  v_has_digital_orders boolean;
begin
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin') into v_caller_is_admin;
  if not v_caller_is_admin then
    raise exception 'Hanya admin yang boleh menghapus pengguna secara permanen.';
  end if;

  select role, username, wallet_balance into v_target_role, v_target_username, v_wallet_balance
  from profiles where id = p_user_id;

  if v_target_role is null then
    raise exception 'Pengguna tidak ditemukan.';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Akun admin tidak bisa dihapus lewat fitur ini.';
  end if;

  if v_wallet_balance <> 0 then
    raise exception 'Saldo dompet pengguna belum Rp 0 (Rp %). Selesaikan/tarik saldonya dulu sebelum hapus permanen.', v_wallet_balance;
  end if;

  select exists(
    select 1 from escrow_payments where employer_id = p_user_id or worker_id = p_user_id
  ) into v_has_escrow;
  if v_has_escrow then
    raise exception 'Pengguna punya riwayat transaksi escrow pekerjaan. Tidak bisa dihapus permanen -- gunakan Tangguhkan.';
  end if;

  select exists(
    select 1 from ratings where employer_id = p_user_id or worker_id = p_user_id
  ) into v_has_ratings;
  if v_has_ratings then
    raise exception 'Pengguna punya riwayat rating/ulasan pekerjaan. Tidak bisa dihapus permanen -- gunakan Tangguhkan.';
  end if;

  select exists(
    select 1 from digital_orders where buyer_id = p_user_id or seller_id = p_user_id
  ) into v_has_digital_orders;
  if v_has_digital_orders then
    raise exception 'Pengguna punya riwayat order marketplace digital. Tidak bisa dihapus permanen -- gunakan Tangguhkan.';
  end if;

  -- lepas referensi non-cascade yang sifatnya cuma metadata (kolom nullable)
  update jobs set assigned_worker_id = null where assigned_worker_id = p_user_id;
  update transactions set reviewed_by = null where reviewed_by = p_user_id;
  update topup_requests set reviewed_by = null where reviewed_by = p_user_id;
  update digital_orders set reviewed_by = null where reviewed_by = p_user_id;
  update audit_log set actor_id = null where actor_id = p_user_id;
  update disputes set assigned_admin_id = null where assigned_admin_id = p_user_id;

  -- catat di audit log SEBELUM datanya hilang
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'delete_user_permanent', 'profiles', p_user_id,
          jsonb_build_object('username', v_target_username, 'role', v_target_role));

  -- hapus postingan kerja milik pengguna ini (aman -- sudah dipastikan
  -- di atas tidak ada escrow/rating yang menempel ke job-job ini)
  delete from jobs where employer_id = p_user_id;

  -- hapus akun auth -- otomatis men-cascade profiles + semua turunannya
  delete from auth.users where id = p_user_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_delete_user_permanent(uuid) to authenticated;
