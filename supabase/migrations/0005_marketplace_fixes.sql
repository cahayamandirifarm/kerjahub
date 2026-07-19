-- =========================================================
-- KERJAHUB — MIGRATION 0005: PERBAIKAN MARKETPLACE DIGITAL
-- Jalankan SETELAH 0001, 0002, 0003, 0004.
--
-- Perbaikan:
-- 1) Produk yang diposting penjual tetap TAMPIL di marketplace
--    sampai pembayaran pembeli benar-benar dikonfirmasi admin.
--    Sebelumnya produk langsung disembunyikan (status 'terjual')
--    begitu pembeli klik "Beli", padahal pembayaran belum tentu
--    jadi / belum diverifikasi.
-- 2) Fee platform marketplace digital dipisah dari fee platform
--    pekerjaan biasa, dan di-set ke 5% (bisa diubah lewat halaman
--    Pengaturan Website di admin panel, key: marketplace_fee_percent).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Setting fee khusus marketplace digital (default 5%)
-- ---------------------------------------------------------
insert into platform_settings (key, value, description) values
  ('marketplace_fee_percent', '5', 'Persentase komisi platform saat transaksi marketplace digital berhasil')
on conflict (key) do nothing;

-- ---------------------------------------------------------
-- 2) create_digital_order: JANGAN tandai listing 'terjual' di sini.
--    Listing tetap 'aktif' (tampil) sampai admin konfirmasi pembayaran.
-- ---------------------------------------------------------
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

  -- Listing SENGAJA tidak diubah statusnya di sini. Ia baru ditandai
  -- 'terjual' oleh admin_confirm_digital_payment saat pembayaran
  -- benar-benar dikonfirmasi, supaya tetap tampil ke pembeli lain
  -- selama menunggu pembayaran/verifikasi.

  insert into notifications (profile_id, title, body, link, category)
  values (v_listing.seller_id, 'Ada pembeli baru', 'Produk "' || v_listing.title || '" dipesan, menunggu pembayaran.', '/dashboard/marketplace/orders', 'pembayaran');

  return v_row;
end;
$$ language plpgsql security definer;

grant execute on function public.create_digital_order(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) admin_confirm_digital_payment: di sinilah listing baru
--    ditandai 'terjual' (saat approve), dan order lain yang masih
--    menunggu pembayaran untuk listing yang sama otomatis dibatalkan
--    supaya tidak ada pembeli lain yang membayar produk yang sama.
-- ---------------------------------------------------------
create or replace function public.admin_confirm_digital_payment(p_order_id uuid, p_approve boolean)
returns void as $$
declare
  v_order digital_orders%rowtype;
  v_other record;
begin
  if not public.is_admin() then raise exception 'Tidak berhak'; end if;
  select * into v_order from digital_orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  if p_approve then
    update digital_orders set status = 'dana_diamankan', reviewed_by = auth.uid() where id = p_order_id;
    update digital_listings set status = 'terjual' where id = v_order.listing_id;

    insert into notifications (profile_id, title, body, link, category)
    values (v_order.seller_id, 'Pembayaran dikonfirmasi', 'Dana pembeli sudah diamankan platform. Silakan proses & kirim produk.', '/dashboard/marketplace/orders', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_order.buyer_id, 'Pembayaran dikonfirmasi', 'Penjual akan segera memproses produkmu.', '/dashboard/marketplace/orders', 'pembayaran');

    -- Batalkan order lain yang masih menunggu untuk listing yang sama
    for v_other in
      select * from digital_orders
      where listing_id = v_order.listing_id
        and id <> v_order.id
        and status in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin')
    loop
      update digital_orders set status = 'dibatalkan' where id = v_other.id;
      insert into notifications (profile_id, title, body, link, category)
      values (v_other.buyer_id, 'Produk sudah terjual', 'Maaf, produk yang kamu pesan sudah dibeli pembeli lain. Order dibatalkan otomatis.', '/dashboard/marketplace/orders', 'pembayaran');
    end loop;
  else
    update digital_orders set status = 'menunggu_pembayaran', reviewed_by = auth.uid() where id = p_order_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_order.buyer_id, 'Bukti pembayaran ditolak', 'Silakan unggah ulang bukti transfer yang valid.', '/dashboard/marketplace/orders', 'pembayaran');
  end if;

  perform public.write_audit('admin_confirm_digital_payment', 'digital_orders', p_order_id, jsonb_build_object('approve', p_approve));
end;
$$ language plpgsql security definer;

grant execute on function public.admin_confirm_digital_payment(uuid, boolean) to authenticated;

-- ---------------------------------------------------------
-- 4) complete_digital_order: pakai fee marketplace_fee_percent (5%)
--    khusus produk digital, bukan platform_fee_percent (dipakai jobs).
-- ---------------------------------------------------------
create or replace function public.complete_digital_order(p_order_id uuid)
returns void as $$
declare
  v_order digital_orders%rowtype;
  v_fee_percent numeric := coalesce(public.get_setting_numeric('marketplace_fee_percent'), 5);
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
  values (v_order.seller_id, 'marketplace_digital', v_bersih, v_order.id, 'Hasil penjualan produk digital (setelah komisi platform ' || v_fee_percent || '%)');

  insert into notifications (profile_id, title, body, link, category)
  values (v_order.seller_id, 'Transaksi selesai!', 'Dana Rp' || v_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/marketplace/orders', 'pekerjaan');
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------
-- 5) Listing yang saat ini berstatus 'terjual' tapi order-nya
--    ternyata belum pernah dikonfirmasi admin (dampak dari bug lama)
--    dikembalikan ke 'aktif' supaya tampil lagi di marketplace.
-- ---------------------------------------------------------
update digital_listings dl
set status = 'aktif'
where dl.status = 'terjual'
  and not exists (
    select 1 from digital_orders do2
    where do2.listing_id = dl.id
      and do2.status in ('dana_diamankan', 'menunggu_konfirmasi_selesai', 'selesai')
  );
