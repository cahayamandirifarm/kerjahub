-- =========================================================
-- KERJAHUB — MIGRATION 0035: HARDENING REGISTRASI + REFERRAL
-- Jalankan SETELAH 0034.
--
-- MASALAH: kalau ada apa pun yang gagal saat resolusi kode referral
-- atau saat trigger auto-generate referral_code (misalnya race
-- condition langka saat generate kode unik, atau hal lain yang
-- tak terduga), seluruh proses pendaftaran akun baru ikut gagal --
-- padahal fitur referral cuma "pelengkap", tidak seharusnya bisa
-- menghalangi orang membuat akun.
--
-- FIX: handle_new_user() sekarang membungkus SELURUH proses (resolusi
-- kode referral + insert profil) dalam blok EXCEPTION. Kalau resolusi
-- kode referral bermasalah, upline diabaikan (referred_by = null) dan
-- akun tetap berhasil dibuat. Kalau bahkan itu masih gagal (kasus
-- sangat jarang, misalnya tabrakan referral_code), dicoba ulang SEKALI
-- lagi tanpa referred_by sama sekali. Pesan error asli tetap dicatat
-- lewat RAISE WARNING supaya masih bisa dilacak di Postgres Logs.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_ref_code text := upper(coalesce(new.raw_user_meta_data->>'referral_code', ''));
  v_upline uuid;
begin
  begin
    if v_ref_code <> '' then
      select id into v_upline from public.profiles where referral_code = v_ref_code;
    end if;

    insert into public.profiles (id, username, full_name, phone, referred_by)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
      new.raw_user_meta_data->>'phone',
      v_upline
    );
  exception when others then
    raise warning 'handle_new_user: gagal proses referral (kode=%), lanjut tanpa upline. Error: %', v_ref_code, sqlerrm;

    -- Percobaan kedua: sama sekali tanpa referred_by, supaya akun
    -- tetap berhasil dibuat walau ada masalah spesifik di kode referral.
    insert into public.profiles (id, username, full_name, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
      new.raw_user_meta_data->>'phone'
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$ language plpgsql security definer;
