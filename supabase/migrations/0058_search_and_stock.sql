-- =========================================================
-- KERJAHUB — MIGRATION 0058: PENCARIAN LAYANAN PEKERJA + STOK PRODUK MARKETPLACE
-- Jalankan SETELAH 0001-0057.
--
-- Fitur:
-- 1) Tambah parameter opsional p_search (cocokkan judul lowongan/jasa,
--    nama pekerja, & skill) ke nearby_jobs & nearby_workers, dipakai oleh
--    kotak pencarian baru di halaman /kategori, /dashboard/employer/nearby-workers,
--    dan section "Lowongan & Pekerja Terdekat".
-- 2) Kolom `stock` di digital_listings (default 1) -- jumlah stok produk
--    marketplace. create_digital_order() sekarang mengurangi stok setiap
--    kali ada penjualan (order dibuat), dan hanya menandai produk
--    'terjual' (habis) kalau stok sudah mencapai 0. Kalau order yang
--    mengurangi stok itu dibatalkan (oleh admin atau otomatis karena bukti
--    transfer tidak diunggah), stoknya dikembalikan +1 dan produk dibuka
--    lagi ('aktif') kalau sempat berstatus 'terjual'.
-- =========================================================

-- ---------------------------------------------------------
-- 1) PENCARIAN: nearby_jobs & nearby_workers + p_search
-- ---------------------------------------------------------
drop function if exists public.nearby_jobs(double precision, double precision, integer, text);
drop function if exists public.nearby_workers(double precision, double precision, integer, text);

create or replace function public.nearby_jobs(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null,
  p_search text default null
)
returns table (
  id uuid, title text, category text, price numeric, is_nego boolean, estimated_duration text,
  district text, city text, distance_m double precision, created_at timestamptz
) as $$
  select j.id, j.title, j.category, j.price, j.is_nego, j.estimated_duration,
         e.district, e.city,
         ST_Distance(
           coalesce(j.geom, e.geom),
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
         ) as distance_m,
         j.created_at
  from jobs j
  join profiles e on e.id = j.employer_id
  where j.stage = 'terbuka'
    and j.is_active = true
    and j.posted_by_role = 'employer'
    and (p_category is null or j.category = p_category)
    and (p_search is null or trim(p_search) = '' or j.title ilike '%' || trim(p_search) || '%')
    and coalesce(j.geom, e.geom) is not null
    and ST_DWithin(
      coalesce(j.geom, e.geom),
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      coalesce(j.radius_km, public.get_setting_numeric('default_radius_km')) * 1000
    )
  order by distance_m asc, j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_jobs(double precision, double precision, integer, text, text) to authenticated, anon;

create or replace function public.nearby_workers(
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 50,
  p_category text default null,
  p_search text default null
)
returns table (
  id uuid, full_name text, skills text[], district text, city text,
  rating_avg numeric, rating_count integer, completed_jobs_count integer,
  is_online boolean, distance_m double precision,
  job_id uuid, job_title text, job_category text, job_price numeric, job_is_nego boolean, job_estimated_duration text
) as $$
  select p.id, p.full_name, p.skills, p.district, p.city,
         p.rating_avg, p.rating_count, p.completed_jobs_count, p.is_online,
         ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
         listing.id as job_id, listing.title as job_title, listing.category as job_category,
         listing.price as job_price, listing.is_nego as job_is_nego, listing.estimated_duration as job_estimated_duration
  from profiles p
  join lateral (
    select j.id, j.title, j.category, j.price, j.is_nego, j.estimated_duration
    from jobs j
    where j.employer_id = p.id
      and j.posted_by_role = 'worker'
      and j.stage = 'terbuka'
      and j.is_active = true
      and (p_category is null or j.category = p_category)
    order by j.created_at desc
    limit 1
  ) listing on true
  where p.role = 'worker'
    and p.geom is not null
    and (
      p_search is null or trim(p_search) = ''
      or listing.title ilike '%' || trim(p_search) || '%'
      or p.full_name ilike '%' || trim(p_search) || '%'
      or exists (select 1 from unnest(coalesce(p.skills, '{}')) s where s ilike '%' || trim(p_search) || '%')
    )
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      public.get_setting_numeric('default_radius_km') * 1000
    )
  order by distance_m asc, p.rating_avg desc, p.completed_jobs_count desc, p.is_online desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.nearby_workers(double precision, double precision, integer, text, text) to authenticated, anon;

-- ---------------------------------------------------------
-- 2) STOK PRODUK MARKETPLACE
-- ---------------------------------------------------------
alter table digital_listings add column if not exists stock integer not null default 1;
alter table digital_listings add constraint digital_listings_stock_check check (stock >= 0);

-- Pembeli klik "Beli" -> buat order + kurangi stok. Produk hanya ditandai
-- 'terjual' (habis) begitu stok mencapai 0 -- kalau stok masih tersisa,
-- produk tetap 'aktif' dan bisa dibeli pembeli lain.
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
  if v_listing.stock <= 0 then
    raise exception 'Stok produk sudah habis';
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

  update digital_listings
  set stock = stock - 1,
      status = case when stock - 1 <= 0 then 'terjual' else status end
  where id = v_listing.id;

  insert into notifications (profile_id, title, body, link, category)
  values (v_listing.seller_id, 'Ada pembeli baru', 'Produk "' || v_listing.title || '" dipesan, menunggu pembayaran.', '/dashboard/marketplace/orders', 'pembayaran');

  return v_row;
end;
$$ language plpgsql security definer;

grant execute on function public.create_digital_order(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) KEMBALIKAN STOK KALAU ORDER DIBATALKAN
-- ---------------------------------------------------------
create or replace function public.admin_action_transaction(p_source text, p_id uuid, p_action text)
returns void as $$
declare
  v_admin uuid := auth.uid();
  v_tx transactions%rowtype;
  v_req topup_requests%rowtype;
  v_escrow escrow_payments%rowtype;
  v_order digital_orders%rowtype;
  v_was_nego boolean;
begin
  if not public.is_admin() then
    raise exception 'Tidak berhak';
  end if;
  if p_action not in ('terima', 'tolak', 'batalkan') then
    raise exception 'Aksi tidak dikenal';
  end if;

  -- ===== transactions (deposit lama & penarikan) =====
  if p_source = 'transaction' then
    select * into v_tx from transactions where id = p_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;
    if v_tx.status <> 'menunggu' then raise exception 'Transaksi sudah diproses'; end if;

    if p_action = 'terima' then
      if v_tx.type = 'deposit' then
        perform public.admin_review_deposit(p_id, true, v_admin);
      elsif v_tx.type = 'penarikan' then
        perform public.admin_review_withdrawal(p_id, true, v_admin);
      else
        raise exception 'Jenis transaksi ini tidak bisa diterima manual';
      end if;
    elsif p_action = 'tolak' then
      if v_tx.type = 'deposit' then
        perform public.admin_review_deposit(p_id, false, v_admin);
      elsif v_tx.type = 'penarikan' then
        perform public.admin_review_withdrawal(p_id, false, v_admin);
      else
        raise exception 'Jenis transaksi ini tidak bisa ditolak manual';
      end if;
    elsif p_action = 'batalkan' then
      update transactions set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;
      if v_tx.type = 'penarikan' then
        update profiles set wallet_balance = wallet_balance + v_tx.amount where id = v_tx.profile_id;
      end if;
      insert into notifications (profile_id, title, body, link, category)
      values (v_tx.profile_id, 'Transaksi dibatalkan', 'Transaksi Rp ' || v_tx.amount || ' dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
    end if;

  -- ===== topup_requests (permintaan top up baru) =====
  elsif p_source = 'topup_request' then
    select * into v_req from topup_requests where id = p_id for update;
    if not found then raise exception 'Permintaan top up tidak ditemukan'; end if;
    if v_req.status <> 'pending' then raise exception 'Permintaan sudah diproses'; end if;

    if p_action = 'terima' then
      perform public.admin_review_topup(p_id, true);
    elsif p_action = 'tolak' then
      perform public.admin_review_topup(p_id, false);
    elsif p_action = 'batalkan' then
      update topup_requests set status = 'dibatalkan', reviewed_by = v_admin, reviewed_at = now() where id = p_id;
      insert into notifications (profile_id, title, body, link, category)
      values (v_req.user_id, 'Top up dibatalkan', 'Permintaan top up Rp ' || v_req.amount_final || ' dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
    end if;

  -- ===== escrow_payments (pembayaran job) =====
  elsif p_source = 'escrow_payment' then
    select * into v_escrow from escrow_payments where id = p_id for update;
    if not found then raise exception 'Pembayaran escrow tidak ditemukan'; end if;

    if p_action = 'terima' then
      if v_escrow.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk dikonfirmasi'; end if;
      perform public.admin_confirm_escrow(p_id, true, v_admin);
    elsif p_action = 'tolak' then
      if v_escrow.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk ditolak'; end if;
      perform public.admin_confirm_escrow(p_id, false, v_admin);
    elsif p_action = 'batalkan' then
      if v_escrow.status not in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin') then
        raise exception 'Transaksi sudah final, tidak bisa dibatalkan';
      end if;
      update escrow_payments set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;

      select exists (
        select 1 from nego_offers where job_id = v_escrow.job_id and status = 'diterima'
      ) into v_was_nego;

      update jobs
      set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null,
          is_nego = v_was_nego
      where id = v_escrow.job_id;
      update applications set status = 'dibatalkan' where job_id = v_escrow.job_id and status = 'diterima';

      if v_escrow.wallet_deducted > 0 then
        update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
        insert into transactions (profile_id, job_id, type, amount, status, note)
        values (v_escrow.employer_id, v_escrow.job_id, 'refund', v_escrow.wallet_deducted, 'berhasil',
          'Pengembalian saldo karena pembayaran escrow dibatalkan admin.');
      end if;
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.employer_id, 'Pembayaran job dibatalkan', 'Pembayaran escrow dibatalkan oleh admin, postingan dibuka lagi.' ||
        (case when v_escrow.wallet_deducted > 0 then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
        '/dashboard/employer', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_escrow.worker_id, 'Job dibatalkan', 'Pembayaran dari pemberi kerja dibatalkan oleh admin, postingan dibuka lagi.', '/dashboard/worker', 'pembayaran');
    end if;

  -- ===== digital_orders (order marketplace digital) =====
  elsif p_source = 'digital_order' then
    select * into v_order from digital_orders where id = p_id for update;
    if not found then raise exception 'Order tidak ditemukan'; end if;

    if p_action = 'terima' then
      if v_order.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk dikonfirmasi'; end if;
      perform public.admin_confirm_digital_payment(p_id, true);
    elsif p_action = 'tolak' then
      if v_order.status <> 'menunggu_konfirmasi_admin' then raise exception 'Belum ada bukti transfer untuk ditolak'; end if;
      perform public.admin_confirm_digital_payment(p_id, false);
    elsif p_action = 'batalkan' then
      if v_order.status not in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin') then
        raise exception 'Order sudah final, tidak bisa dibatalkan';
      end if;
      update digital_orders set status = 'dibatalkan', reviewed_by = v_admin where id = p_id;

      -- Kembalikan stok produk (penjualan batal) & buka lagi kalau sempat 'terjual'.
      update digital_listings
      set stock = stock + 1,
          status = case when status = 'terjual' then 'aktif' else status end
      where id = v_order.listing_id;

      insert into notifications (profile_id, title, body, link, category)
      values (v_order.buyer_id, 'Order dibatalkan', 'Order marketplace kamu dibatalkan oleh admin.', '/dashboard/riwayat', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_order.seller_id, 'Order dibatalkan', 'Order untuk produkmu dibatalkan oleh admin, stok dikembalikan.', '/dashboard/riwayat', 'pembayaran');
    end if;

  else
    raise exception 'Sumber transaksi tidak dikenal';
  end if;

  perform public.write_audit('admin_action_transaction', p_source, p_id, jsonb_build_object('action', p_action));
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 4) auto_cancel_expired_transactions() -- ikut kembalikan stok
-- ---------------------------------------------------------
create or replace function public.auto_cancel_expired_transactions()
returns void as $$
declare
  v_row record;
  v_was_nego boolean;
begin
  -- Top up dompet lama (transactions type deposit)
  for v_row in
    select * from transactions
    where type = 'deposit' and status = 'menunggu' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update transactions set status = 'dibatalkan' where id = v_row.id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.profile_id, 'Top up dibatalkan otomatis', 'Top up Rp ' || v_row.amount || ' dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Permintaan top up baru (topup_requests)
  for v_row in
    select * from topup_requests
    where status = 'pending' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update topup_requests set status = 'dibatalkan', reviewed_at = now() where id = v_row.id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.user_id, 'Top up dibatalkan otomatis', 'Permintaan top up Rp ' || v_row.amount_final || ' dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Pembayaran escrow job yang belum diupload buktinya
  for v_row in
    select * from escrow_payments
    where status = 'menunggu_pembayaran' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update escrow_payments set status = 'dibatalkan' where id = v_row.id;

    select exists (
      select 1 from nego_offers where job_id = v_row.job_id and status = 'diterima'
    ) into v_was_nego;

    update jobs
    set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null,
        is_nego = v_was_nego
    where id = v_row.job_id and stage in ('menunggu_pembayaran', 'diterima');
    update applications set status = 'dibatalkan' where job_id = v_row.job_id and status = 'diterima';

    if v_row.wallet_deducted > 0 then
      update profiles set wallet_balance = wallet_balance + v_row.wallet_deducted where id = v_row.employer_id;
      insert into transactions (profile_id, job_id, type, amount, status, note)
      values (v_row.employer_id, v_row.job_id, 'refund', v_row.wallet_deducted, 'berhasil',
        'Pengembalian saldo karena pembayaran escrow dibatalkan otomatis (6 jam tanpa bukti transfer).');
    end if;
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.employer_id, 'Pembayaran job dibatalkan otomatis', 'Pembayaran job dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam. Postingan dibuka lagi.' ||
      (case when v_row.wallet_deducted > 0 then ' Saldo Rp' || v_row.wallet_deducted || ' yang sempat terpotong sudah dikembalikan.' else '' end),
      '/dashboard/employer', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_row.worker_id, 'Job dibatalkan otomatis', 'Pemberi kerja tidak menyelesaikan pembayaran dalam 6 jam, postingan dibuka lagi.', '/dashboard/worker', 'pembayaran');
  end loop;

  -- Order marketplace digital yang belum diupload buktinya
  for v_row in
    select * from digital_orders
    where status = 'menunggu_pembayaran' and proof_url is null
      and created_at < now() - interval '6 hours'
  loop
    update digital_orders set status = 'dibatalkan' where id = v_row.id;

    -- Kembalikan stok produk & buka lagi kalau sempat 'terjual'.
    update digital_listings
    set stock = stock + 1,
        status = case when status = 'terjual' then 'aktif' else status end
    where id = v_row.listing_id;

    insert into notifications (profile_id, title, body, link, category)
    values (v_row.buyer_id, 'Order dibatalkan otomatis', 'Order marketplace dibatalkan otomatis karena bukti transfer tidak diunggah dalam 6 jam.', '/dashboard/riwayat', 'pembayaran');
  end loop;

  -- Catatan: penarikan saldo ('penarikan') SENGAJA tidak kena
  -- auto-cancel, karena user tidak perlu upload bukti apa pun --
  -- yang ditunggu justru admin yang memproses transfer.
end;
$$ language plpgsql security definer;
