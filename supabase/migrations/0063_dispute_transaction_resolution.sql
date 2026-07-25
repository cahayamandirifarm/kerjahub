-- =========================================================
-- KERJAHUB — MIGRATION 0063: RESOLUSI TRANSAKSI DARI SENGKETA CHAT
-- Jalankan SETELAH 0062.
--
-- Konteks: tiket `disputes` (dibuka lewat perintah /tanyaadmin di chat)
-- sebelumnya cuma bisa ditandai "selesai"/"ditolak" TANPA menyentuh
-- transaksi job/order yang mendasarinya sama sekali (lihat resolve_dispute
-- di migration 0006) -- keputusan soal uang & status job/order masih
-- harus dilakukan manual di tempat lain. Migration ini menambah SATU RPC
-- baru, `resolve_dispute_transaction`, yang dipanggil dari 2 tombol baru
-- di admin panel ("Transaksi Dibatalkan" & "Transaksi Selesai"):
--
-- 1) "batalkan" -- transaksi dibatalkan:
--    - Job: kalau pembayaran escrow sempat berhasil & motong saldo
--      dompet (wallet_deducted > 0), full DIKEMBALIKAN ke pemberi upah
--      (employer_id di escrow_payments -- ini juga berlaku utk jasa
--      pekerja lewat nego, karena employer_id di escrow SELALU pihak
--      yang bayar, bukan berdasarkan siapa yang posting). Job dibuka
--      lagi (stage='terbuka') supaya bisa dilamar/dipesan ulang.
--    - Marketplace: order dibatalkan, stok produk dikembalikan. Uang
--      pembeli TIDAK PERNAH masuk wallet_balance internal di alur ini
--      (dibayar via transfer bank + bukti, bukan potong saldo) --
--      jadi otomatis tidak ada yang perlu dikembalikan; yang penting
--      penjual TIDAK menerima payout apa pun (saldo tetap seperti semula).
--    Kedua kasus di atas persis memenuhi permintaan: "saldo dompet
--    pemberi upah / penjual produk digital tetap (tidak terpotong)".
--
-- 2) "selesai" -- transaksi dinyatakan selesai oleh admin (dana yang
--    sudah diamankan di escrow/order dicairkan ke pekerja/penjual,
--    persis meniru logic approve_completion() / complete_digital_order()
--    yang normalnya dipicu pengguna sendiri, tapi di sini dipicu admin).
--
-- Setelah SALAH SATU aksi di atas: tiket sengketa ditutup (status =
-- 'selesai'), dan SEMUA anggota percakapan -- termasuk admin yang
-- sedang menangani -- "keluar" dari bubble chat (disembunyikan dari
-- daftar chat masing-masing lewat conversation_members.hidden_at,
-- mekanisme yang sama dengan delete_conversation_history di migration
-- 0038). Riwayat pesan TIDAK dihapus (tetap ada di database sebagai
-- bukti, sesuai catatan is_locked saat sengketa dibuka), cuma tidak
-- lagi muncul di kotak masuk siapa pun.
--
-- CATATAN PENTING (asumsi yang perlu dikonfirmasi ke tim produk):
-- Aksi "batalkan"/"selesai" hanya bisa dipakai kalau job/order masih
-- berstatus aktif (belum 'selesai'/'dibatalkan' sebelumnya). Untuk job
-- yang sengketanya dibuka SEBELUM pembayaran escrow pernah berhasil,
-- aksi "batalkan" tetap membuka lagi postingannya (tanpa ada saldo yang
-- perlu dikembalikan karena memang belum pernah terpotong), sedangkan
-- aksi "selesai" akan DITOLAK (tidak ada dana yang bisa dicairkan).
-- =========================================================

create or replace function public.resolve_dispute_transaction(
  p_dispute_id uuid,
  p_action text,
  p_note text default null
)
returns void as $$
declare
  v_admin uuid := auth.uid();
  v_dispute disputes%rowtype;
  v_conv conversations%rowtype;
  v_job jobs%rowtype;
  v_order digital_orders%rowtype;
  v_escrow escrow_payments%rowtype;
  v_fee_percent numeric;
  v_komisi numeric(14,2);
  v_bersih numeric(14,2);
  v_was_nego boolean;
  v_had_escrow boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa menyelesaikan sengketa';
  end if;
  if p_action not in ('batalkan', 'selesai') then
    raise exception 'Aksi tidak dikenal';
  end if;

  select * into v_dispute from disputes where id = p_dispute_id for update;
  if not found then raise exception 'Tiket sengketa tidak ditemukan'; end if;
  if v_dispute.status in ('selesai', 'ditolak') then
    raise exception 'Sengketa ini sudah ditutup sebelumnya';
  end if;

  select * into v_conv from conversations where id = v_dispute.conversation_id for update;
  if not found then raise exception 'Percakapan untuk sengketa ini tidak ditemukan'; end if;

  -- ============================================================
  -- SUMBER: JOB (lowongan pekerja ATAU jasa pekerja lewat nego)
  -- ============================================================
  if v_conv.source_type = 'job' then
    select * into v_job from jobs where id = v_conv.job_id for update;
    if not found then raise exception 'Postingan job untuk sengketa ini tidak ditemukan'; end if;
    if v_job.stage in ('selesai', 'dibatalkan') then
      raise exception 'Transaksi job ini sudah final sebelumnya, tidak bisa diproses lewat sengketa';
    end if;

    select * into v_escrow from escrow_payments
    where job_id = v_job.id and status = 'berhasil'
    order by created_at desc limit 1 for update;
    v_had_escrow := found;

    if p_action = 'batalkan' then
      if v_had_escrow then
        update escrow_payments set status = 'dibatalkan', reviewed_by = v_admin where id = v_escrow.id;
        if v_escrow.wallet_deducted > 0 then
          update profiles set wallet_balance = wallet_balance + v_escrow.wallet_deducted where id = v_escrow.employer_id;
          insert into transactions (profile_id, job_id, type, amount, status, note)
          values (v_escrow.employer_id, v_job.id, 'refund', v_escrow.wallet_deducted, 'berhasil',
            'Pengembalian saldo -- transaksi dibatalkan admin lewat penyelesaian sengketa chat.');
        end if;
      end if;

      select exists (
        select 1 from nego_offers where job_id = v_job.id and status = 'diterima'
      ) into v_was_nego;

      update jobs
      set stage = 'terbuka', assigned_worker_id = null, client_id = null, paid_at = null,
          is_nego = v_was_nego
      where id = v_job.id;
      update applications set status = 'dibatalkan' where job_id = v_job.id and status = 'diterima';

      insert into notifications (profile_id, title, body, link, category)
      values (v_job.employer_id, 'Sengketa selesai — transaksi dibatalkan',
        'Admin membatalkan transaksi ini setelah menengahi sengketa.' ||
        (case when v_had_escrow and v_escrow.wallet_deducted > 0
          then ' Saldo Rp' || v_escrow.wallet_deducted || ' yang sempat terpotong sudah dikembalikan penuh.'
          else '' end),
        '/dashboard/employer', 'pembayaran');
      if v_job.assigned_worker_id is not null then
        insert into notifications (profile_id, title, body, link, category)
        values (v_job.assigned_worker_id, 'Sengketa selesai — transaksi dibatalkan',
          'Admin membatalkan transaksi ini setelah menengahi sengketa.', '/dashboard/worker', 'pembayaran');
      end if;

    elsif p_action = 'selesai' then
      if not v_had_escrow then
        raise exception 'Belum ada pembayaran yang berhasil diamankan untuk job ini, tidak bisa dinyatakan selesai';
      end if;

      v_fee_percent := coalesce(public.get_setting_numeric('platform_fee_percent'), 10);
      v_komisi := round(v_job.price * v_fee_percent / 100, 2);
      v_bersih := v_job.price - v_komisi;

      update profiles set
        wallet_balance = wallet_balance + v_bersih,
        completed_jobs_count = completed_jobs_count + 1
      where id = v_job.assigned_worker_id;

      insert into transactions (profile_id, job_id, type, amount, status, note)
      values (v_job.assigned_worker_id, v_job.id, 'terima_upah', v_bersih, 'berhasil',
        'Sengketa diselesaikan admin -- pekerjaan "' || v_job.title || '" dinyatakan selesai, upah Rp' || v_job.price ||
        ', belum termasuk biaya fee ' || v_fee_percent || '% platform.');
      insert into transactions (profile_id, job_id, type, amount, status, note)
      values (v_job.assigned_worker_id, v_job.id, 'komisi_platform', v_komisi, 'berhasil', 'Komisi platform untuk: ' || v_job.title);

      perform public.credit_referral_commission(
        v_job.assigned_worker_id, v_job.id, v_komisi,
        'Komisi referral dari pekerjaan downline-mu: ' || v_job.title
      );

      update jobs set stage = 'selesai', completed_at = now(), finish_popup_seen = false where id = v_job.id;

      insert into notifications (profile_id, title, body, link, category)
      values (v_job.assigned_worker_id, 'Sengketa selesai — upah cair',
        'Admin menyelesaikan sengketa ini, upah Rp' || v_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/worker', 'pekerjaan');
      insert into notifications (profile_id, title, body, link, category)
      values (v_job.employer_id, 'Sengketa selesai — transaksi selesai',
        'Admin menyelesaikan sengketa ini, transaksi dinyatakan selesai.', '/dashboard/employer', 'pekerjaan');
    end if;

  -- ============================================================
  -- SUMBER: MARKETPLACE (order produk digital)
  -- ============================================================
  elsif v_conv.source_type = 'marketplace' then
    select * into v_order from digital_orders where id = v_conv.order_id for update;
    if not found then raise exception 'Order marketplace untuk sengketa ini tidak ditemukan'; end if;
    if v_order.status in ('selesai', 'dibatalkan') then
      raise exception 'Order ini sudah final sebelumnya, tidak bisa diproses lewat sengketa';
    end if;

    if p_action = 'batalkan' then
      update digital_orders set status = 'dibatalkan', reviewed_by = v_admin where id = v_order.id;

      -- Kembalikan stok produk (penjualan batal) & buka lagi kalau sempat 'terjual'.
      -- Uang pembeli dibayar via transfer bank + bukti (bukan potong saldo
      -- dompet internal), jadi tidak ada wallet_balance pembeli yang perlu
      -- dikembalikan di sini -- dan penjual memang belum pernah menerima
      -- payout apa pun sebelum order 'selesai', jadi saldo penjual otomatis
      -- tetap seperti semula begitu dibatalkan.
      update digital_listings
      set stock = stock + 1, status = case when status = 'terjual' then 'aktif' else status end
      where id = v_order.listing_id;

      insert into notifications (profile_id, title, body, link, category)
      values (v_order.buyer_id, 'Sengketa selesai — order dibatalkan',
        'Admin membatalkan order ini setelah menengahi sengketa.', '/dashboard/riwayat', 'pembayaran');
      insert into notifications (profile_id, title, body, link, category)
      values (v_order.seller_id, 'Sengketa selesai — order dibatalkan',
        'Admin membatalkan order ini setelah menengahi sengketa, stok produk sudah dikembalikan.', '/dashboard/riwayat', 'pembayaran');

    elsif p_action = 'selesai' then
      v_fee_percent := coalesce(public.get_setting_numeric('marketplace_fee_percent'), 5);
      v_komisi := round(v_order.base_amount * v_fee_percent / 100, 2);
      v_bersih := v_order.base_amount - v_komisi;

      update profiles set wallet_balance = wallet_balance + v_bersih where id = v_order.seller_id;
      update digital_orders set status = 'selesai', completed_at = now() where id = v_order.id;

      insert into wallet_transactions (user_id, type, amount, reference_id, note)
      values (v_order.seller_id, 'marketplace_digital', v_bersih, v_order.id,
        'Sengketa diselesaikan admin -- hasil penjualan produk digital (setelah komisi platform ' || v_fee_percent || '%)');

      perform public.credit_referral_commission(
        v_order.seller_id, null, v_komisi, 'Komisi referral dari penjualan produk digital downline-mu.'
      );

      insert into notifications (profile_id, title, body, link, category)
      values (v_order.seller_id, 'Sengketa selesai — dana cair',
        'Admin menyelesaikan sengketa ini, dana Rp' || v_bersih || ' sudah masuk ke saldo kamu.', '/dashboard/marketplace/orders', 'pekerjaan');
      insert into notifications (profile_id, title, body, link, category)
      values (v_order.buyer_id, 'Sengketa selesai — order selesai',
        'Admin menyelesaikan sengketa ini, order dinyatakan selesai.', '/dashboard/riwayat', 'pekerjaan');
    end if;

  else
    raise exception 'Jenis percakapan tidak dikenal';
  end if;

  -- ============================================================
  -- TUTUP TIKET SENGKETA
  -- ============================================================
  update disputes
  set status = 'selesai',
      resolution_note = coalesce(p_note, case
        when p_action = 'batalkan' then 'Transaksi dibatalkan oleh admin.'
        else 'Transaksi dinyatakan selesai oleh admin.'
      end),
      assigned_admin_id = coalesce(assigned_admin_id, v_admin),
      updated_at = now(),
      closed_at = now()
  where id = p_dispute_id;

  insert into messages (conversation_id, sender_id, content, message_type, is_system)
  values (
    v_conv.id, v_admin,
    case when p_action = 'batalkan'
      then 'Sengketa diselesaikan admin: transaksi DIBATALKAN. Percakapan ini ditutup.'
      else 'Sengketa diselesaikan admin: transaksi dinyatakan SELESAI. Percakapan ini ditutup.'
    end,
    'system', true
  );

  -- Keluarkan SEMUA anggota -- termasuk admin yang menengahi -- dari
  -- bubble chat ini (hilang dari daftar chat masing-masing, riwayat
  -- pesan tetap tersimpan di database sebagai bukti).
  update conversation_members set hidden_at = now() where conversation_id = v_conv.id;

  perform public.write_audit('resolve_dispute_transaction', 'disputes', p_dispute_id, jsonb_build_object('action', p_action));
end;
$$ language plpgsql security definer;

grant execute on function public.resolve_dispute_transaction(uuid, text, text) to authenticated;
