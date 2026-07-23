-- =========================================================
-- KERJAHUB — MIGRATION 0048: FITUR HARGA NEGO LEWAT CHAT
-- Jalankan SETELAH 0001-0047.
--
-- Tujuan: pemberi kerja (butuh pekerja) ATAU pencari kerja (menawarkan
-- jasa) bisa memasang postingan dengan harga "Nego" (tanpa harga
-- tetap). Peminat menanyakan harga langsung lewat chat pra-deal
-- (start_job_chat, migrasi 0010) dengan tombol nominal cepat
-- (5rb/10rb/15rb/20rb/25rb/nominal lain). Begitu kedua pihak setuju
-- pada satu nominal, sistem OTOMATIS membuat lamaran + escrow dan
-- mengunci job ke stage 'menunggu_pembayaran' — pop-up pembayaran
-- otomatis (migrasi 0045) langsung muncul untuk pihak pembayar, PERSIS
-- seperti alur terima lamaran biasa (accept_applicant, migrasi 0027),
-- termasuk potong saldo dompet otomatis (migrasi 0026) kalau saldo
-- pembayar mencukupi.
-- =========================================================

-- ---------------------------------------------------------
-- 1) jobs: tandai postingan sebagai harga nego (bukan harga tetap)
-- ---------------------------------------------------------
alter table jobs add column if not exists is_nego boolean not null default false;

-- ---------------------------------------------------------
-- 2) messages: tipe pesan baru 'nego_offer' untuk bubble tawaran harga
-- ---------------------------------------------------------
alter table messages drop constraint if exists messages_message_type_check;
alter table messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'document', 'system', 'nego_offer'));

-- ---------------------------------------------------------
-- 3) NEGO_OFFERS: riwayat tawaran harga per percakapan pra-deal job
-- ---------------------------------------------------------
create table if not exists nego_offers (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  offered_by uuid not null references profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'menunggu' check (status in ('menunggu', 'diterima', 'ditolak', 'dibatalkan')),
  message_id uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists nego_offers_conversation_idx on nego_offers(conversation_id);
create index if not exists nego_offers_job_idx on nego_offers(job_id);

alter table messages add column if not exists nego_offer_id uuid references nego_offers(id) on delete set null;

alter table nego_offers drop constraint if exists nego_offers_message_id_fkey;
alter table nego_offers add constraint nego_offers_message_id_fkey
  foreign key (message_id) references messages(id) on delete set null;

alter table nego_offers enable row level security;

drop policy if exists "Anggota percakapan & admin bisa lihat tawaran nego" on nego_offers;
create policy "Anggota percakapan & admin bisa lihat tawaran nego" on nego_offers
  for select using (
    conversation_id in (select conversation_id from conversation_members where profile_id = auth.uid())
    or public.is_admin()
  );
-- Tidak ada policy insert/update langsung dari client — semua perubahan
-- WAJIB lewat RPC security definer di bawah supaya validasi (siapa boleh
-- nego, job masih terbuka, dst) selalu dijalankan konsisten.

do $$
begin
  alter publication supabase_realtime add table public.nego_offers;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------
-- 4) RPC: send_nego_offer — ajukan tawaran nominal di chat pra-deal job
-- ---------------------------------------------------------
create or replace function public.send_nego_offer(p_conversation_id uuid, p_amount numeric)
returns table (offer_id uuid, message_id uuid) as $$
declare
  v_conv conversations%rowtype;
  v_job jobs%rowtype;
  v_other_id uuid;
  v_offer_id uuid;
  v_message_id uuid;
  v_amount_text text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal tawaran tidak valid';
  end if;

  select * into v_conv from conversations where id = p_conversation_id;
  if not found then raise exception 'Percakapan tidak ditemukan'; end if;
  if v_conv.source_type <> 'job' or v_conv.job_id is null then
    raise exception 'Fitur nego harga hanya berlaku untuk chat lowongan/tawaran jasa';
  end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conversation_id and profile_id = auth.uid()) then
    raise exception 'Kamu bukan anggota percakapan ini';
  end if;
  if exists (select 1 from profiles where id = auth.uid() and is_suspended = true) then
    raise exception 'Akun kamu sedang ditangguhkan';
  end if;

  select * into v_job from jobs where id = v_conv.job_id for update;
  if not found then raise exception 'Postingan tidak ditemukan'; end if;
  if not v_job.is_nego then raise exception 'Postingan ini tidak memakai harga nego'; end if;
  if v_job.stage <> 'terbuka' then raise exception 'Postingan ini sudah tidak menerima nego lagi'; end if;

  select profile_id into v_other_id from conversation_members
  where conversation_id = p_conversation_id and profile_id <> auth.uid()
  limit 1;

  -- Tawaran baru menggantikan tawaran yang masih menunggu di percakapan ini
  -- (dari pihak manapun), supaya cuma ada 1 tawaran aktif setiap saat.
  update nego_offers set status = 'dibatalkan', responded_at = now()
  where conversation_id = p_conversation_id and status = 'menunggu';

  v_amount_text := trim(to_char(p_amount, '999G999G999G999'));

  insert into nego_offers (conversation_id, job_id, offered_by, amount)
  values (p_conversation_id, v_job.id, auth.uid(), p_amount)
  returning id into v_offer_id;

  insert into messages (conversation_id, sender_id, content, message_type, nego_offer_id)
  values (p_conversation_id, auth.uid(), 'Mengajukan harga Rp' || v_amount_text, 'nego_offer', v_offer_id)
  returning id into v_message_id;

  update nego_offers set message_id = v_message_id where id = v_offer_id;
  update conversations set last_message_at = now() where id = p_conversation_id;

  if v_other_id is not null then
    insert into notifications (profile_id, title, body, link, category)
    values (v_other_id, 'Tawaran harga baru', 'Ada tawaran Rp' || v_amount_text || ' untuk "' || v_job.title || '".', '/chat/' || p_conversation_id, 'chat');
  end if;

  return query select v_offer_id, v_message_id;
end;
$$ language plpgsql security definer;

grant execute on function public.send_nego_offer(uuid, numeric) to authenticated;

-- ---------------------------------------------------------
-- 5) RPC: respond_nego_offer — terima/tolak tawaran.
--    Terima -> otomatis buat lamaran + escrow PERSIS seperti
--    accept_applicant() versi terbaru (migrasi 0027), termasuk potong
--    saldo dompet otomatis, supaya pop-up pembayaran (migrasi 0045)
--    otomatis muncul untuk pembayar tanpa perlu langkah tambahan.
-- ---------------------------------------------------------
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

    insert into notifications (profile_id, title, body, link, category)
    values (v_offer.offered_by, 'Tawaran ditolak', 'Tawaran Rp' || v_amount_text || ' ditolak oleh lawan bicara.', '/chat/' || v_conv.id, 'chat');

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
    -- Postingan jasa/mencari kerja: pembuat postingan (employer_id) ADALAH
    -- pekerja yang mengerjakan & menerima upah. Lawan chat = klien yang
    -- tertarik & wajib bayar + berhak approve hasil kerja.
    v_payee_id := v_job.employer_id;
    v_payer_id := v_other_id;
  else
    -- Lowongan kerja biasa: pembuat postingan yang bayar, lawan chat yang kerja.
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
-- 6) RPC: cancel_nego_offer — pengaju membatalkan tawarannya sendiri
--    selama masih berstatus 'menunggu' (belum direspons).
-- ---------------------------------------------------------
create or replace function public.cancel_nego_offer(p_offer_id uuid)
returns void as $$
declare
  v_offer nego_offers%rowtype;
begin
  select * into v_offer from nego_offers where id = p_offer_id for update;
  if not found then raise exception 'Tawaran tidak ditemukan'; end if;
  if v_offer.offered_by <> auth.uid() then raise exception 'Hanya pengaju yang bisa membatalkan tawaran ini'; end if;
  if v_offer.status <> 'menunggu' then raise exception 'Tawaran ini sudah tidak bisa dibatalkan'; end if;

  update nego_offers set status = 'dibatalkan', responded_at = now() where id = p_offer_id;

  insert into messages (conversation_id, sender_id, content, message_type, is_system, nego_offer_id)
  values (v_offer.conversation_id, auth.uid(), 'Tawaran harga dibatalkan oleh pengaju.', 'system', true, p_offer_id);
  update conversations set last_message_at = now() where id = v_offer.conversation_id;
end;
$$ language plpgsql security definer;

grant execute on function public.cancel_nego_offer(uuid) to authenticated;
