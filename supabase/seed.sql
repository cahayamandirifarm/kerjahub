-- =========================================================
-- KERJAHUB — SEED DATA DEMO
-- Jalankan SETELAH 0001_init.sql, di Supabase SQL Editor.
--
-- Akun demo di bawah didaftarkan lewat SQL langsung (setara dengan
-- proses signUp username+password+HP di halaman /register). Supabase
-- Auth tetap butuh format email, jadi dibuat email internal
-- `<username>@users.kerjahub.internal` yang tidak pernah ditampilkan
-- ke pengguna — di UI mereka login pakai username saja.
--
-- Login demo di /login pakai USERNAME (bukan email), contoh:
--   Username: employer1   Password: Demo1234!
--
-- Akun superadmin login terpisah di /admin/login pakai EMAIL biasa.
-- =========================================================

create extension if not exists pgcrypto;

do $$
declare
  v_admin_id uuid := 'a0000000-0000-4000-8000-000000000001';
  v_employer1_id uuid := 'a0000000-0000-4000-8000-000000000002';
  v_employer2_id uuid := 'a0000000-0000-4000-8000-000000000003';
  v_worker1_id uuid := 'a0000000-0000-4000-8000-000000000004';
  v_worker2_id uuid := 'a0000000-0000-4000-8000-000000000005';
  v_pw text := crypt('Demo1234!', gen_salt('bf'));
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@kerjahub.demo', v_pw, now(), '{"provider":"email","providers":["email"]}',
      '{"username":"admin"}', now(), now()),
    (v_employer1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'employer1@users.kerjahub.internal', v_pw, now(), '{"provider":"email","providers":["email"]}',
      '{"username":"employer1","phone":"081234500001"}', now(), now()),
    (v_employer2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'employer2@users.kerjahub.internal', v_pw, now(), '{"provider":"email","providers":["email"]}',
      '{"username":"employer2","phone":"081234500002"}', now(), now()),
    (v_worker1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'worker1@users.kerjahub.internal', v_pw, now(), '{"provider":"email","providers":["email"]}',
      '{"username":"worker1","phone":"081234500003"}', now(), now()),
    (v_worker2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'worker2@users.kerjahub.internal', v_pw, now(), '{"provider":"email","providers":["email"]}',
      '{"username":"worker2","phone":"081234500004"}', now(), now())
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  select uuid_generate_v4(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
  from auth.users u
  where u.id in (v_admin_id, v_employer1_id, v_employer2_id, v_worker1_id, v_worker2_id)
  on conflict do nothing;

  -- set nama tampilan, role & data tambahan (trigger handle_new_user sudah membuat baris profiles)
  update profiles set role = 'admin', full_name = 'Super Admin', kyc_status = 'terverifikasi'
    where id = v_admin_id;

  update profiles set role = 'employer', full_name = 'Budi Santoso', kyc_status = 'terverifikasi', wallet_balance = 1500000
    where id = v_employer1_id;
  update profiles set role = 'employer', full_name = 'Sari Dewi', kyc_status = 'terverifikasi', wallet_balance = 800000
    where id = v_employer2_id;

  update profiles set role = 'worker', full_name = 'Andi Pratama', kyc_status = 'terverifikasi', wallet_balance = 250000,
    skills = array['Berkebun','Perawatan Taman','Pangkas Rumput'],
    bank_name = 'BCA', bank_account_number = '1234567890', bank_account_holder = 'Andi Pratama'
    where id = v_worker1_id;
  update profiles set role = 'worker', full_name = 'Rina Wulandari', kyc_status = 'menunggu', wallet_balance = 0,
    skills = array['Bersih-bersih Rumah','Setrika','Cuci Mobil'],
    bank_name = 'BNI', bank_account_number = '0987654321', bank_account_holder = 'Rina Wulandari'
    where id = v_worker2_id;

  -- demo jobs
  insert into jobs (employer_id, title, category, description, location, is_remote, price, estimated_duration, stage)
  values
    (v_employer1_id, 'Butuh Tukang Kebun untuk Pangkas Rumput & Rapikan Taman', 'Tukang Kebun',
      'Rumah 2 lantai dengan taman depan-belakang sekitar 150m2. Butuh pangkas rumput, rapikan tanaman pagar, dan bersihkan daun kering.',
      'Jakarta Selatan', false, 150000, '1 hari (4-5 jam)', 'terbuka'),
    (v_employer1_id, 'Bersih-bersih Rumah Mingguan (Rutin)', 'Bersih-bersih Rumah',
      'Cari ART lepas untuk bersih-bersih rumah tipe 45 setiap hari Sabtu. Termasuk menyapu, mengepel, dan cuci piring.',
      'Jakarta Selatan', false, 120000, '3-4 jam', 'terbuka'),
    (v_employer2_id, 'Kurir Antar Dokumen ke Bandung (Hari Ini)', 'Antar Jemput / Kurir',
      'Butuh kurir untuk antar dokumen penting dari Jakarta ke Bandung, PP di hari yang sama. Kendaraan dari pihak pekerja.',
      'Jakarta - Bandung', false, 350000, '1 hari', 'terbuka'),
    (v_employer2_id, 'Desain Logo untuk UMKM Kuliner', 'Desain & Konten Digital',
      'Butuh desainer untuk membuat 1 logo brand kuliner rumahan, termasuk 3 alternatif konsep dan file source.',
      'Remote', true, 500000, '3-5 hari', 'terbuka'),
    (v_worker1_id, 'Jasa Perawatan Taman & Kebun Profesional', 'Tukang Kebun',
      'Menawarkan jasa perawatan taman rutin: pangkas rumput, pemupukan, penataan tanaman hias. Berpengalaman 5 tahun.',
      'Jabodetabek', false, 200000, 'Per kunjungan (2-3 jam)', 'terbuka');

  insert into bank_accounts (bank_name, account_number, account_holder, is_active)
  values ('BCA', '8800112233', 'PT KerjaHub Indonesia', true)
  on conflict do nothing;
end $$;
