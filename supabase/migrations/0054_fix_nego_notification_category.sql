-- =========================================================
-- KERJAHUB — MIGRATION 0051: FIX BADGE/PUSH UNTUK NEGO DITOLAK/DIBATALKAN
-- Jalankan SETELAH 0001-0050.
--
-- AKAR MASALAH (sudah diverifikasi persis di respond_nego_offer &
-- cancel_nego_offer, migrasi 0048):
--
-- 1. Pesan sistem hasil aksi nego ("Tawaran ... ditolak/dibatalkan")
--    disimpan dengan is_system = true di tabel `messages`. Edge function
--    send-chat-push SENGAJA melewati (skip) semua pesan is_system, supaya
--    pesan sistem generik (mis. "kerja sama dimulai") tidak spam push.
-- 2. Notifikasi utk penolakan tawaran (respond_nego_offer, cabang tolak)
--    ditulis ke tabel `notifications` dengan category = 'chat' — padahal
--    trigger jalur umum (trg_notify_push_for_notification, migrasi 0044)
--    JUGA sengaja melewati category = 'chat' (supaya tidak dobel dengan
--    push pesan chat biasa).
-- 3. Hasilnya: dua jalur push yang sama-sama "sengaja melewati" saling
--    tumpuk lubangnya -> notifikasi tolak tawaran TIDAK PERNAH memicu
--    push/badge sama sekali.
-- 4. cancel_nego_offer malah lebih parah: tidak menulis baris ke tabel
--    `notifications` SAMA SEKALI -- jadi lawan bicara tidak dapat badge
--    ataupun notifikasi in-app apa pun saat tawaran dibatalkan pengaju.
-- 5. "Setujui Harga" tetap berfungsi separuh karena ada notifikasi
--    tambahan berkategori 'pembayaran'/'lamaran' (BUKAN 'chat') yang
--    tetap lolos jalur umum seperti biasa.
--
-- FIX: pindahkan notifikasi status nego (ditolak/dibatalkan) ke category
-- 'nego' (bukan 'chat') supaya lolos jalur umum seperti kategori lain,
-- dan tambahkan notifikasi yang tadinya tidak ada sama sekali di
-- cancel_nego_offer. Tidak menyentuh skip is_system di edge function
-- ataupun skip category='chat' di trigger umum -- keduanya tetap benar
-- untuk pesan chat biasa, cuma kategorinya saja yang diperbaiki di sini.
-- =========================================================

create or replace function public.respond_nego_offer(p_offer_id uuid, p_accept boolean)
returns table (accepted boolean, escrow_id uuid, payer_id uuid) as $$
declare
  v_offer nego_offers%rowtype;
  v_conv conversations%rowtype;
  v_job jobs%rowtype;
  v_other_id uuid;         -- pihak lawan bicara pemilik postingan (= "pelamar")
  v_payer_id uuid;
  v_payee_id uuid;
  v_payer_balance numeric(14,2);
  v_wallet_deduct numeric(14,2);
  v_remaining numeric(14,2);
  v_status escrow_status;
  v_code integer;
  v_bank bank_accounts%rowtype;
  v_escrow_id uuid;
  v_amount_text text;
begin
  select * into v_offer from nego_offers where id = p_offer_id for update;
  if not found then raise exception 'Tawaran tidak ditemukan'; end if;
  if v_offer.status <> 'menunggu' then raise exception 'Tawaran ini sudah tidak berlaku'; end if;
  if v_offer.offered_by = auth.uid() then raise exception 'Tidak bisa merespons tawaranmu sendiri'; end if;

  select * into v_conv from conversations where id = v_offer.conversation_id;
  if not exists (select 1 from conversation_members where conversation_id = v_conv.id and profile_id = auth.uid()) then
    raise exception 'Kamu bukan anggota percakapan ini';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  v_amount_text := trim(to_char(v_offer.amount, '999G999G999G999'));

  if not p_accept then
    update nego_offers set status = 'ditolak', responded_at = now() where id = p_offer_id;

    insert into messages (conversation_id, sender_id, content, message_type, is_system, nego_offer_id)
    values (v_conv.id, auth.uid(), 'Tawaran harga Rp' || v_amount_text || ' ditolak.', 'system', true, p_offer_id);
    update conversations set last_message_at = now() where id = v_conv.id;

    -- FIX 0051: category 'nego' (bukan 'chat') supaya push/badge-nya
    -- benar-benar terkirim lewat jalur notifikasi umum.
    insert into notifications (profile_id, title, body, link, category)
    values (v_offer.offered_by, 'Tawaran ditolak', 'Tawaran Rp' || v_amount_text || ' ditolak oleh lawan bicara.', '/chat/' || v_conv.id, 'nego');

    return query select false, null::uuid, null::uuid;
    return;
  end if;

  select * into v_job from jobs where id = v_offer.job_id for update;
  if v_job.stage <> 'terbuka' then raise exception 'Postingan ini sudah tidak terbuka untuk nego'; end if;

  select profile_id into v_other_id from conversation_members
  where conversation_id = v_conv.id and profile_id <> v_job.employer_id
  limit 1;
  if v_other_id is null then raise exception 'Lawan bicara tidak ditemukan di percakapan ini'; end if;

  if v_job.posted_by_role = 'worker' then
    v_payee_id := v_job.employer_id;
    v_payer_id := v_other_id;
  else
    v_payer_id := v_job.employer_id;
    v_payee_id := v_other_id;
  end if;

  select wallet_balance into v_payer_balance from profiles where id = v_payer_id for update;
  v_wallet_deduct := least(coalesce(v_payer_balance, 0), v_offer.amount);
  v_remaining := v_offer.amount - v_wallet_deduct;

  if v_wallet_deduct > 0 then
    update profiles set wallet_balance = wallet_balance - v_wallet_deduct where id = v_payer_id;
    insert into transactions (profile_id, job_id, type, amount, status, note)
    values (v_payer_id, v_job.id, 'bayar_kerja', v_wallet_deduct, 'berhasil',
      'Dipotong otomatis dari saldo untuk: ' || v_job.title ||
      (case when v_remaining > 0 then ' (sisa wajib transfer manual)' else ' (lunas dari saldo)' end));
  end if;

  if v_remaining > 0 then
    select * into v_bank from bank_accounts where is_active = true order by created_at limit 1;
    loop
      v_code := floor(random() * 900 + 100)::integer;
      exit when not exists (
        select 1 from escrow_payments
        where unique_code = v_code and status in ('menunggu_pembayaran', 'menunggu_konfirmasi_admin')
      );
    end loop;
    v_status := 'menunggu_pembayaran';
  else
    v_bank := null;
    v_code := 0;
    v_status := 'berhasil';
  end if;

  insert into applications (job_id, worker_id, status, message)
  values (v_job.id, v_other_id, 'diterima', 'Disepakati lewat nego harga di chat')
  on conflict (job_id, worker_id) do update set status = 'diterima';
  update applications set status = 'ditolak' where job_id = v_job.id and worker_id <> v_other_id and status = 'menunggu';

  insert into escrow_payments
    (job_id, employer_id, worker_id, base_amount, unique_code, total_amount, bank_account_id, status, wallet_deducted, confirmed_at)
  values
    (v_job.id, v_payer_id, v_payee_id, v_remaining, v_code, v_remaining + v_code,
     (case when v_bank.id is not null then v_bank.id else null end), v_status, v_wallet_deduct,
     (case when v_status = 'berhasil' then now() else null end))
  returning id into v_escrow_id;

  update jobs
  set price = v_offer.amount,
      is_nego = false,
      stage = (case when v_status = 'berhasil' then 'dana_diamankan' else 'menunggu_pembayaran' end)::job_stage,
      assigned_worker_id = v_payee_id,
      client_id = v_payer_id,
      paid_at = (case when v_status = 'berhasil' then now() else paid_at end)
  where id = v_job.id;

  update nego_offers set status = 'diterima', responded_at = now() where id = p_offer_id;

  insert into messages (conversation_id, sender_id, content, message_type, is_system, nego_offer_id)
  values (v_conv.id, auth.uid(), 'Harga disepakati: Rp' || v_amount_text || '. ' ||
    (case when v_status = 'berhasil' then 'Pembayaran lunas otomatis dari saldo.'
      else 'Menunggu pembayaran dari ' || (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '.' end),
    'system', true, p_offer_id);
  update conversations set last_message_at = now() where id = v_conv.id;

  if v_status = 'berhasil' then
    insert into notifications (profile_id, title, body, link, category)
    values (v_payee_id, 'Dana diamankan platform', 'Harga Rp' || v_amount_text || ' untuk "' || v_job.title || '" lunas otomatis dari saldo ' ||
      (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '. Kamu bisa mulai bekerja sekarang.', '/dashboard/worker', 'pembayaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_payer_id, 'Pembayaran berhasil dari saldo', 'Rp' || v_wallet_deduct || ' otomatis terpotong dari saldo untuk mengamankan "' || v_job.title || '". Dana sudah diamankan platform.', '/dashboard/employer', 'pembayaran');
  else
    insert into notifications (profile_id, title, body, link, category)
    values (v_payee_id, 'Nego disepakati!', 'Harga Rp' || v_amount_text || ' untuk "' || v_job.title || '" disepakati. Menunggu pembayaran dari ' ||
      (case when v_job.posted_by_role = 'worker' then 'klien' else 'pemberi kerja' end) || '.', '/dashboard/worker', 'lamaran');
    insert into notifications (profile_id, title, body, link, category)
    values (v_payer_id, 'Selesaikan pembayaran', (case when v_wallet_deduct > 0
        then 'Rp' || v_wallet_deduct || ' sudah terpotong dari saldo. Sisa transfer Rp' || (v_remaining + v_code) || ' untuk mengamankan "' || v_job.title || '".'
        else 'Transfer Rp' || (v_remaining + v_code) || ' untuk mengamankan "' || v_job.title || '".'
      end), '/dashboard/employer/escrow/' || v_escrow_id, 'pembayaran');
  end if;

  perform public.write_audit('respond_nego_offer', 'jobs', v_job.id, jsonb_build_object(
    'offer_id', p_offer_id, 'escrow_id', v_escrow_id, 'payer_id', v_payer_id, 'payee_id', v_payee_id,
    'amount', v_offer.amount, 'wallet_deducted', v_wallet_deduct, 'remaining_transfer', v_remaining));

  return query select true, v_escrow_id, v_payer_id;
end;
$$ language plpgsql security definer;

grant execute on function public.respond_nego_offer(uuid, boolean) to authenticated;

-- ---------------------------------------------------------
-- cancel_nego_offer — FIX 0051: tambahkan notifikasi ke lawan bicara
-- (sebelumnya tidak ada notifikasi apa pun ditulis di sini), category
-- 'nego' supaya lolos jalur push umum.
-- ---------------------------------------------------------
create or replace function public.cancel_nego_offer(p_offer_id uuid)
returns void as $$
declare
  v_offer nego_offers%rowtype;
  v_job jobs%rowtype;
  v_other_id uuid;
  v_amount_text text;
begin
  select * into v_offer from nego_offers where id = p_offer_id for update;
  if not found then raise exception 'Tawaran tidak ditemukan'; end if;
  if v_offer.offered_by <> auth.uid() then raise exception 'Hanya pengaju yang bisa membatalkan tawaran ini'; end if;
  if v_offer.status <> 'menunggu' then raise exception 'Tawaran ini sudah tidak bisa dibatalkan'; end if;

  update nego_offers set status = 'dibatalkan', responded_at = now() where id = p_offer_id;

  insert into messages (conversation_id, sender_id, content, message_type, is_system, nego_offer_id)
  values (v_offer.conversation_id, auth.uid(), 'Tawaran harga dibatalkan oleh pengaju.', 'system', true, p_offer_id);
  update conversations set last_message_at = now() where id = v_offer.conversation_id;

  select profile_id into v_other_id from conversation_members
  where conversation_id = v_offer.conversation_id and profile_id <> v_offer.offered_by
  limit 1;

  if v_other_id is not null then
    v_amount_text := trim(to_char(v_offer.amount, '999G999G999G999'));
    select * into v_job from jobs where id = v_offer.job_id;
    insert into notifications (profile_id, title, body, link, category)
    values (v_other_id, 'Tawaran dibatalkan',
      'Tawaran Rp' || v_amount_text || ' untuk "' || coalesce(v_job.title, 'postingan') || '" dibatalkan oleh pengaju.',
      '/chat/' || v_offer.conversation_id, 'nego');
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.cancel_nego_offer(uuid) to authenticated;
