-- =========================================================
-- KERJAHUB — MIGRATION 0036: PERKUAT TRIGGER AUTO-GENERATE
-- KODE REFERRAL SUPAYA TIDAK PERNAH BISA MENGGAGALKAN
-- PENDAFTARAN, DAN PERBAIKI RISIKO TABRAKAN KODE SAAT BACKFILL.
--
-- KONTEKS: migration 0035 sudah membungkus proses resolusi kode
-- referral di handle_new_user() dengan EXCEPTION handler. TAPI kalau
-- trigger trg_protect_referral_columns (yang auto-generate
-- referral_code lewat generate_unique_referral_code()) gagal di
-- PERCOBAAN KEDUA (fallback insert tanpa referred_by), error itu
-- TIDAK tertangkap oleh siapa pun lagi dan akan menggagalkan seluruh
-- proses signUp(). Migration ini menutup celah tsb dengan membuat
-- trigger auto-generate kodenya sendiri TIDAK PERNAH bisa melempar
-- error (dibungkus EXCEPTION internal + fallback deterministik dari
-- UUID), jadi errornya berhenti di sini, tidak pernah naik ke atas.
-- =========================================================

-- ---------------------------------------------------------
-- 1) generate_unique_referral_code(): batasi jumlah percobaan &
--    tambahkan jalur fallback yang dijamin selesai (dari UUID),
--    supaya tidak ada kemungkinan loop tanpa akhir.
-- ---------------------------------------------------------
create or replace function public.generate_unique_referral_code()
returns text as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;

    if v_attempt <= 20 then
      select string_agg(substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1), '')
      into v_code
      from generate_series(1, 6);
    else
      -- fallback super jarang: turunkan dari UUID acak (heksadesimal,
      -- otomatis cocok dengan format [A-Z0-9]{6}) supaya loop dijamin
      -- berhenti walau generator acak di atas terus tabrakan.
      v_code := upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6));
    end if;

    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;

  return v_code;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------
-- 2) protect_referral_columns(): auto-generate kode dibungkus
--    EXCEPTION sendiri. Kalau ada apa pun yang gagal di sini
--    (kasus sangat jarang), pakai fallback dari UUID langsung
--    supaya trigger ini TIDAK PERNAH melempar error ke pemanggil
--    (yaitu proses insert profil saat registrasi).
-- ---------------------------------------------------------
create or replace function public.protect_referral_columns()
returns trigger as $$
begin
  if tg_op = 'INSERT' and new.referral_code is null then
    begin
      new.referral_code := public.generate_unique_referral_code();
    exception when others then
      raise warning 'protect_referral_columns: gagal generate kode referral, pakai fallback UUID. Error: %', sqlerrm;
      new.referral_code := upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6));
    end;
  end if;

  if new.referral_code is not null then
    new.referral_code := upper(new.referral_code);
  end if;

  if tg_op = 'UPDATE' and new.referred_by is distinct from old.referred_by then
    new.referred_by := old.referred_by;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------
-- 3) handle_new_user(): tambahkan search_path eksplisit (praktik
--    aman untuk fungsi SECURITY DEFINER) — logika sudah benar dari
--    migration 0035, tidak diubah.
-- ---------------------------------------------------------
alter function public.handle_new_user() set search_path = public;

-- ---------------------------------------------------------
-- 4) Perbaiki risiko tabrakan kode referral saat backfill: migration
--    0034 memakai satu statement UPDATE untuk semua baris sekaligus,
--    yang secara teori bisa membuat 2 baris mendapat kode acak yang
--    SAMA (karena keduanya tidak saling lihat perubahan di statement
--    yang sama). Jalankan ulang backfill di sini per baris (aman
--    dijalankan berkali-kali, hanya memproses baris yang masih null).
-- ---------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from profiles where referral_code is null loop
    update profiles set referral_code = public.generate_unique_referral_code() where id = r.id;
  end loop;
end $$;
