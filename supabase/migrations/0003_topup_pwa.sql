-- =========================================================
-- KERJAHUB — MIGRATION 0003: TOP UP SALDO + PWA SUPPORT
-- Jalankan SETELAH 0001_init.sql dan 0002_features.sql.
-- =========================================================

-- ---------------------------------------------------------
-- 1) PAYMENT SETTINGS (rekening + QRIS, dikelola admin)
-- Single-row settings table (selalu id = 1).
-- ---------------------------------------------------------
create table if not exists payment_settings (
  id integer primary key default 1,
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  qris_image_url text,
  updated_at timestamptz not null default now(),
  constraint payment_settings_singleton check (id = 1)
);

insert into payment_settings (id, bank_name, account_number, account_holder)
values (1, 'BRI', '1234567890', 'PT KerjaHub Indonesia')
on conflict (id) do nothing;

alter table payment_settings enable row level security;
create policy "Semua orang login bisa baca payment settings" on payment_settings
  for select using (auth.role() = 'authenticated');
create policy "Hanya admin ubah payment settings" on payment_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 2) TOPUP REQUESTS (permintaan top up saldo dompet)
-- ---------------------------------------------------------
create type topup_status as enum ('pending', 'paid', 'rejected');

create table if not exists topup_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_input numeric(14,2) not null check (amount_input > 0),
  unique_code integer not null,
  amount_final numeric(14,2) not null,
  payment_method text not null default 'transfer',
  proof_url text,
  status topup_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists topup_requests_status_idx on topup_requests(status);
create index if not exists topup_requests_user_idx on topup_requests(user_id);

alter table topup_requests enable row level security;
create policy "User lihat topup miliknya, admin lihat semua" on topup_requests
  for select using (auth.uid() = user_id or public.is_admin());
-- Catatan: insert & update status HANYA lewat fungsi security definer di
-- bawah, supaya user tidak bisa langsung set status jadi 'paid' sendiri.

-- ---------------------------------------------------------
-- 3) WALLET TRANSACTIONS (log resmi penambahan/pengurangan saldo)
-- ---------------------------------------------------------
create table if not exists wallet_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null, -- 'topup', 'penarikan', dst
  amount numeric(14,2) not null,
  reference_id uuid, -- id topup_requests / transaksi terkait
  note text,
  created_at timestamptz not null default now()
);
alter table wallet_transactions enable row level security;
create policy "User lihat wallet_transactions miliknya, admin lihat semua" on wallet_transactions
  for select using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------
-- 4) FUNGSI: user mengajukan top up (generate kode unik 3 digit)
-- ---------------------------------------------------------
create or replace function public.create_topup_request(p_amount_input numeric, p_payment_method text default 'transfer')
returns topup_requests as $$
declare
  v_code integer;
  v_row topup_requests;
begin
  if p_amount_input <= 0 then
    raise exception 'Nominal top up tidak valid';
  end if;

  -- kode unik 3 digit (100-999), hindari bentrok dengan request pending lain
  loop
    v_code := floor(random() * 900 + 100)::integer;
    exit when not exists (
      select 1 from topup_requests
      where unique_code = v_code and status = 'pending'
    );
  end loop;

  insert into topup_requests (user_id, amount_input, unique_code, amount_final, payment_method, status)
  values (auth.uid(), p_amount_input, v_code, p_amount_input + v_code, p_payment_method, 'pending')
  returning * into v_row;

  insert into notifications (profile_id, title, body, link, category)
  select id, 'Permintaan top up baru', 'Rp' || v_row.amount_final || ' menunggu verifikasi.', '/admin/topup-requests', 'pembayaran'
  from profiles where role = 'admin';

  return v_row;
end;
$$ language plpgsql security definer;

grant execute on function public.create_topup_request(numeric, text) to authenticated;

-- ---------------------------------------------------------
-- 5) FUNGSI: user tandai "Saya Sudah Transfer" (opsional bukti)
-- ---------------------------------------------------------
create or replace function public.mark_topup_transferred(p_request_id uuid, p_proof_url text default null)
returns void as $$
begin
  update topup_requests
  set proof_url = coalesce(p_proof_url, proof_url)
  where id = p_request_id and user_id = auth.uid() and status = 'pending';
end;
$$ language plpgsql security definer;

grant execute on function public.mark_topup_transferred(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 6) FUNGSI: admin konfirmasi / tolak top up
-- ---------------------------------------------------------
create or replace function public.admin_review_topup(p_request_id uuid, p_approve boolean)
returns void as $$
declare
  v_req topup_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Tidak berhak';
  end if;

  select * into v_req from topup_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if v_req.status <> 'pending' then raise exception 'Permintaan sudah diproses'; end if;

  if p_approve then
    update topup_requests set status = 'paid', reviewed_by = auth.uid(), reviewed_at = now() where id = p_request_id;
    update profiles set wallet_balance = wallet_balance + v_req.amount_input where id = v_req.user_id;

    insert into wallet_transactions (user_id, type, amount, reference_id, note)
    values (v_req.user_id, 'topup', v_req.amount_input, v_req.id, 'Top up saldo dikonfirmasi admin');

    insert into notifications (profile_id, title, body, link, category)
    values (v_req.user_id, 'Top up berhasil', 'Saldo Rp' || v_req.amount_input || ' sudah masuk ke dompet kamu.', '/dashboard/employer', 'pembayaran');
  else
    update topup_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = p_request_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_req.user_id, 'Top up ditolak', 'Permintaan top up Rp' || v_req.amount_final || ' ditolak admin.', '/dashboard/employer', 'pembayaran');
  end if;

  perform public.write_audit('admin_review_topup', 'topup_requests', p_request_id, jsonb_build_object('approve', p_approve));
end;
$$ language plpgsql security definer;

grant execute on function public.admin_review_topup(uuid, boolean) to authenticated;

-- ---------------------------------------------------------
-- 7) Realtime untuk topup_requests (dashboard admin real-time)
-- ---------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'topup_requests'
  ) then
    alter publication supabase_realtime add table topup_requests;
  end if;
end $$;

-- ---------------------------------------------------------
-- 8) Storage bucket untuk gambar QRIS admin
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('payment-settings', 'payment-settings', true)
  on conflict (id) do nothing;

create policy "QRIS publik bisa dilihat siapa saja" on storage.objects
  for select using (bucket_id = 'payment-settings');
create policy "Hanya admin upload QRIS" on storage.objects
  for insert with check (bucket_id = 'payment-settings' and public.is_admin());
create policy "Hanya admin update QRIS" on storage.objects
  for update using (bucket_id = 'payment-settings' and public.is_admin());
