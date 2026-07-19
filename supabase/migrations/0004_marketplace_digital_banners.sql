-- =========================================================
-- KERJAHUB — MIGRATION 0004: MARKETPLACE DIGITAL, BANNER, KELOLA POSTINGAN
-- Jalankan SETELAH 0001, 0002, 0003.
-- =========================================================

-- ---------------------------------------------------------
-- 1) KELOLA POSTINGAN KERJA: aktif/nonaktif (soft) + hapus permanen (admin)
-- ---------------------------------------------------------
alter table jobs add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------
-- 2) BANNER SLIDER (dikelola admin)
-- ---------------------------------------------------------
create table if not exists banners (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  link_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table banners enable row level security;
create policy "Semua orang bisa lihat banner aktif" on banners for select using (true);
create policy "Hanya admin kelola banner" on banners for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('banners', 'banners', true)
  on conflict (id) do nothing;
create policy "Banner publik bisa dilihat" on storage.objects for select using (bucket_id = 'banners');
create policy "Hanya admin upload banner" on storage.objects for insert with check (bucket_id = 'banners' and public.is_admin());
create policy "Hanya admin hapus banner" on storage.objects for delete using (bucket_id = 'banners' and public.is_admin());

-- ---------------------------------------------------------
-- 3) MARKETPLACE DIGITAL: kategori & listing
-- ---------------------------------------------------------
create type digital_category as enum (
  'akun_game', 'akun_tiktok', 'akun_facebook', 'akun_instagram', 'akun_youtube', 'lainnya'
);
create type digital_listing_status as enum ('aktif', 'nonaktif', 'terjual', 'dihapus');

create table digital_listings (
  id uuid primary key default uuid_generate_v4(),
  seller_id uuid not null references profiles(id) on delete cascade,
  category digital_category not null,
  title text not null,
  description text not null,
  price numeric(14,2) not null check (price > 0),
  cover_image text not null,
  gallery_images text[] not null default '{}',
  status digital_listing_status not null default 'aktif',
  created_at timestamptz not null default now()
);
create index digital_listings_status_idx on digital_listings(status);
create index digital_listings_category_idx on digital_listings(category);

alter table digital_listings enable row level security;
create policy "Listing aktif bisa dilihat publik" on digital_listings for select using (true);
create policy "Seller bisa insert listing miliknya" on digital_listings
  for insert with check (
    auth.uid() = seller_id
    and not exists (select 1 from profiles where id = auth.uid() and is_suspended = true)
  );
create policy "Seller & admin bisa update listing" on digital_listings
  for update using (auth.uid() = seller_id or public.is_admin());

insert into storage.buckets (id, name, public) values ('digital-listings', 'digital-listings', true)
  on conflict (id) do nothing;
create policy "Foto listing publik bisa dilihat" on storage.objects for select using (bucket_id = 'digital-listings');
create policy "User upload foto listing sendiri" on storage.objects
  for insert with check (bucket_id = 'digital-listings' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------
-- 4) MARKETPLACE DIGITAL: order + escrow + sengketa
-- ---------------------------------------------------------
create type digital_order_status as enum (
  'menunggu_pembayaran',
  'menunggu_konfirmasi_admin',
  'dana_diamankan',
  'menunggu_konfirmasi_selesai',
  'sengketa',
  'selesai',
  'dibatalkan'
);

create table digital_orders (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references digital_listings(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  base_amount numeric(14,2) not null,
  unique_code integer not null,
  amount_final numeric(14,2) not null,
  status digital_order_status not null default 'menunggu_pembayaran',
  proof_url text,
  delivery_proof_url text,
  receipt_proof_url text,
  seller_confirmed boolean not null default false,
  buyer_confirmed boolean not null default false,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index digital_orders_status_idx on digital_orders(status);

alter table digital_orders enable row level security;
create policy "Terlibat & admin lihat order digital" on digital_orders
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or public.is_admin());

insert into storage.buckets (id, name, public) values ('digital-order-proofs', 'digital-order-proofs', false)
  on conflict (id) do nothing;
create policy "User upload bukti order sendiri" on storage.objects
  for insert with check (bucket_id = 'digital-order-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Terlibat & admin lihat bukti order" on storage.objects
  for select using (bucket_id = 'digital-order-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin()));

create table digital_disputes (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references digital_orders(id) on delete cascade,
  opened_by uuid not null references profiles(id),
  reason text not null,
  status text not null default 'terbuka',
  created_at timestamptz not null default now()
);
alter table digital_disputes enable row level security;
create policy "Terlibat & admin lihat sengketa" on digital_disputes
  for select using (
    auth.uid() = opened_by
    or auth.uid() in (select buyer_id from digital_orders where digital_orders.id = digital_disputes.order_id)
    or auth.uid() in (select seller_id from digital_orders where digital_orders.id = digital_disputes.order_id)
    or public.is_admin()
  );
create policy "Terlibat bisa buka sengketa" on digital_disputes
  for insert with check (auth.uid() = opened_by);

-- ---------------------------------------------------------
-- 5) FUNGSI ALUR MARKETPLACE DIGITAL
-- ---------------------------------------------------------

-- Pembeli klik "Beli" -> buat order + kode unik escrow
create or replace function public.create_digital_order(p_listing_id uuid)
returns digital_orders as $$
declare
  v_listing digital_listings%rowtype;
  v_code integer;
  v_row digital_orders;
begin
  select * into v_listing from digital_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'aktif' then
    raise exception 'Produk tidak tersedia';
  end if;
  if v_listing.seller_id = auth.uid() then
    raise exception 'Tidak bisa membeli produk sendiri';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  loop
    v_code := floor(random() * 900 + 100)::integer;
    exit when not exists (
      select 1 from digital_orders
      where unique_code = v_code and status in ('menunggu_pembayaran','menunggu_konfirmasi_admin')
    );
  end loop;

  insert into digital_orders (listing_id, buyer_id, seller_id, base_amount, unique_code, amount_final, status)
  values (v_listing.id, auth.uid(), v_listing.seller_id, v_listing.price, v_code, v_listing.price + v_code, 'menunggu_pembayaran')
  returning * into v_row;

  update digital_listings set status = 'terjual' where id = v_listing.id;

  insert into notifications (profile_id, title, body, link, category)
  values (v_listing.seller_id, 'Ada pembeli baru', 'Produk "' || v_listing.title || '" dipesan, menunggu pembayaran.', '/dashboard/marketplace/orders', 'pembayaran');

  return v_row;
end;
$$ language plpgsql security definer;

grant execute on function public.create_digital_order(uuid) to authenticated;

-- Pembeli upload bukti transfer
create or replace function public.submit_digital_payment(p_order_id uuid, p_proof_url text)
returns void as $$
declare
  v_order digital_orders%rowtype;
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if v_order.buyer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;

  update digital_orders set proof_url = p_proof_url, status = 'menunggu_konfirmasi_admin' where id = p_order_id;

  insert into notifications (profile_id, title, body, link, category)
  select id, 'Bukti pembayaran marketplace digital baru', 'Perlu verifikasi pembayaran order.', '/admin/marketplace-orders', 'pembayaran'
  from profiles where role = 'admin';
end;
$$ language plpgsql security definer;

grant execute on function public.submit_digital_payment(uuid, text) to authenticated;

-- Admin konfirmasi pembayaran -> dana diamankan
create or replace function public.admin_confirm_digital_payment(p_order_id uuid, p_approve boolean)
returns void as $$
declare
  v_order digital_orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Tidak berhak'; end if;
  select * into v_order from digital_orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  if p_approve then
    update digital_orders set status = 'dana_diamankan', reviewed_by = auth.uid() where id = p_order_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_order.seller_id, 'Pembayaran dikonfirmasi', 'Dana pembeli sudah diamankan platform. Silakan proses & kirim produk.', '/dashboard/marketplace/orders', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_order.buyer_id, 'Pembayaran dikonfirmasi', 'Penjual akan segera memproses produkmu.', '/dashboard/marketplace/orders', 'pembayaran');
  else
    update digital_orders set status = 'menunggu_pembayaran', reviewed_by = auth.uid() where id = p_order_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_order.buyer_id, 'Bukti pembayaran ditolak', 'Silakan unggah ulang bukti transfer yang valid.', '/dashboard/marketplace/orders', 'pembayaran');
  end if;

  perform public.write_audit('admin_confirm_digital_payment', 'digital_orders', p_order_id, jsonb_build_object('approve', p_approve));
end;
$$ language plpgsql security definer;

grant execute on function public.admin_confirm_digital_payment(uuid, boolean) to authenticated;

-- Penjual upload bukti penyerahan produk
create or replace function public.submit_delivery_proof(p_order_id uuid, p_proof_url text)
returns void as $$
declare
  v_order digital_orders%rowtype;
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if v_order.seller_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_order.status not in ('dana_diamankan', 'menunggu_konfirmasi_selesai') then
    raise exception 'Status order tidak sesuai';
  end if;

  update digital_orders set
    delivery_proof_url = p_proof_url,
    seller_confirmed = true,
    status = 'menunggu_konfirmasi_selesai'
  where id = p_order_id;

  insert into notifications (profile_id, title, body, link, category)
  values (v_order.buyer_id, 'Produk sudah dikirim', 'Penjual sudah mengirim bukti penyerahan produk. Cek dan konfirmasi penerimaan.', '/dashboard/marketplace/orders', 'pekerjaan');

  if v_order.buyer_confirmed then
    perform public.complete_digital_order(p_order_id);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.submit_delivery_proof(uuid, text) to authenticated;

-- Pembeli upload bukti penerimaan produk
create or replace function public.submit_receipt_proof(p_order_id uuid, p_proof_url text)
returns void as $$
declare
  v_order digital_orders%rowtype;
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if v_order.buyer_id <> auth.uid() then raise exception 'Tidak berhak'; end if;
  if v_order.status <> 'menunggu_konfirmasi_selesai' then raise exception 'Status order tidak sesuai'; end if;

  update digital_orders set receipt_proof_url = p_proof_url, buyer_confirmed = true where id = p_order_id;

  insert into notifications (profile_id, title, body, link, category)
  values (v_order.seller_id, 'Pembeli konfirmasi penerimaan', 'Pembeli sudah upload bukti penerimaan produk.', '/dashboard/marketplace/orders', 'pekerjaan');

  if v_order.seller_confirmed then
    perform public.complete_digital_order(p_order_id);
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.submit_receipt_proof(uuid, text) to authenticated;

-- Selesaikan order: cairkan dana ke penjual (dikurangi komisi platform)
create or replace function public.complete_digital_order(p_order_id uuid)
returns void as $$
declare
  v_order digital_orders%rowtype;
  v_fee_percent numeric := coalesce(public.get_setting_numeric('platform_fee_percent'), 10);
  v_komisi numeric(14,2);
  v_bersih numeric(14,2);
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if v_order.status = 'selesai' then return; end if;

  v_komisi := round(v_order.base_amount * v_fee_percent / 100, 2);
  v_bersih := v_order.base_amount - v_komisi;

  update profiles set wallet_balance = wallet_balance + v_bersih where id = v_order.seller_id;
  update digital_orders set status = 'selesai', completed_at = now() where id = p_order_id;

  insert into wallet_transactions (user_id, type, amount, reference_id, note)
  values (v_order.seller_id, 'marketplace_digital', v_bersih, v_order.id, 'Hasil penjualan produk digital (setelah komisi platform)');

  insert into notifications (profile_id, title, body, link, category)
  values (v_order.seller_id, 'Transaksi selesai!', 'Dana Rp' || v_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/marketplace/orders', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- Buka sengketa
create or replace function public.open_digital_dispute(p_order_id uuid, p_reason text)
returns void as $$
declare
  v_order digital_orders%rowtype;
begin
  select * into v_order from digital_orders where id = p_order_id for update;
  if auth.uid() not in (v_order.buyer_id, v_order.seller_id) then raise exception 'Tidak berhak'; end if;

  update digital_orders set status = 'sengketa' where id = p_order_id;
  insert into digital_disputes (order_id, opened_by, reason) values (p_order_id, auth.uid(), p_reason);

  insert into notifications (profile_id, title, body, link, category)
  select id, 'Sengketa transaksi baru', 'Order marketplace digital memerlukan mediasi admin.', '/admin/marketplace-orders', 'pekerjaan'
  from profiles where role = 'admin';
end;
$$ language plpgsql security definer;

grant execute on function public.open_digital_dispute(uuid, text) to authenticated;

-- Realtime untuk order & listing (dashboard admin & user)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='digital_orders') then
    alter publication supabase_realtime add table digital_orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='digital_listings') then
    alter publication supabase_realtime add table digital_listings;
  end if;
end $$;

-- ---------------------------------------------------------
-- 6) Update nearby_jobs agar ikut memfilter kolom is_active (baru)
-- ---------------------------------------------------------
create or replace function public.nearby_jobs(p_lat double precision, p_lng double precision, p_limit integer default 50)
returns table (
  id uuid, title text, category text, price numeric, estimated_duration text,
  district text, city text, distance_m double precision, created_at timestamptz
) as $$
  select j.id, j.title, j.category, j.price, j.estimated_duration,
         e.district, e.city,
         ST_Distance(j.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         j.created_at
  from jobs j
  join profiles e on e.id = j.employer_id
  where j.stage = 'terbuka'
    and j.is_active = true
    and j.geom is not null
    and ST_DWithin(
      j.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;
