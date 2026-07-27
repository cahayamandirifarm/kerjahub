-- =========================================================
-- KERJAHUB — MIGRATION 0087: EKSPANSI SEO 22 LAYANAN JASA + KOTA OTOMATIS
--
-- Bangun di atas sistem seo_landing_pages/seo_categories/seo_locations dari
-- migration 0086. TIDAK mengubah tabel jobs/digital_listings/marketplace
-- sama sekali -- cuma MEMBACA tabel jobs (read-only) untuk auto-tampilkan
-- "postingan terkait" di tiap landing page.
--
-- CATATAN PENTING: "postingan terkait" di sini diambil dari tabel JOBS
-- (postingan jasa oleh worker), BUKAN digital_listings (marketplace jual-
-- beli akun game/sosmed) -- karena 22 layanan yang diminta (Tukang, Bersih
-- Rumah, Joki ML, dst) itu memang jenis "jasa", bukan jual-beli akun.
--
-- Jalankan SETELAH migration 0086.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom tambahan di seo_categories: dipakai buat AUTO-MATCH postingan
--    jobs yang relevan dengan kategori SEO ini (bukan pilihan manual admin).
-- ---------------------------------------------------------
alter table seo_categories add column if not exists job_category_match text[] not null default '{}';
alter table seo_categories add column if not exists keyword_match text[] not null default '{}';
alter table seo_categories add column if not exists remote_service boolean not null default false;

-- ---------------------------------------------------------
-- 2) Relasi antar-kategori buat internal link "Lihat juga: ..."
--    (otomatis, bukan pilihan manual per landing page)
-- ---------------------------------------------------------
create table if not exists seo_category_relations (
  category_id uuid not null references seo_categories(id) on delete cascade,
  related_category_id uuid not null references seo_categories(id) on delete cascade,
  primary key (category_id, related_category_id)
);
alter table seo_category_relations enable row level security;
create policy "Publik bisa baca relasi kategori SEO" on seo_category_relations for select using (true);
create policy "Admin kelola relasi kategori SEO" on seo_category_relations for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 3) Kota (buat halaman kota otomatis, mis. "Jasa Bersih Rumah Bandung")
-- ---------------------------------------------------------
insert into seo_locations (name, slug) values
  ('Jakarta', 'jakarta'), ('Bandung', 'bandung'), ('Surabaya', 'surabaya'),
  ('Bekasi', 'bekasi'), ('Depok', 'depok'), ('Bogor', 'bogor'),
  ('Semarang', 'semarang'), ('Medan', 'medan'), ('Yogyakarta', 'yogyakarta'),
  ('Makassar', 'makassar')
on conflict (slug) do nothing;

-- ---------------------------------------------------------
-- 4) RPC buat "postingan jasa terkait" di landing page SEO --
--    SECURITY DEFINER, supaya pengunjung anonim (belum login) tetap bisa
--    lihat nama & rating penyedia jasa. TANPA RPC ini, query dari client
--    publik/anon akan kena bug yang SAMA PERSIS dengan yang sudah diperbaiki
--    di migration 0086 (embed profiles selalu null buat visitor anon,
--    karena RLS profiles = "auth.role() = 'authenticated'").
-- ---------------------------------------------------------
create or replace function public.get_seo_related_jobs(
  p_category_match text[],
  p_keyword_match text[],
  p_location_name text,
  p_remote boolean,
  p_limit integer default 6
)
returns setof jsonb as $$
  select (to_jsonb(j) - 'geom') || jsonb_build_object(
    'profiles', case when p.id is null then null else jsonb_build_object(
      'full_name', p.full_name,
      'rating_avg', p.rating_avg,
      'rating_count', p.rating_count
    ) end
  )
  from jobs j
  join profiles p on p.id = j.employer_id
  where j.stage = 'terbuka'
    and (
      (p_category_match is not null and array_length(p_category_match, 1) > 0 and j.category = any(p_category_match))
      or (
        p_keyword_match is not null and array_length(p_keyword_match, 1) > 0
        and exists (select 1 from unnest(p_keyword_match) kw where j.title ilike '%' || kw || '%')
      )
    )
    and (
      (p_remote is true and j.is_remote = true)
      or (p_remote is not true and (p_location_name is null or j.location ilike '%' || p_location_name || '%'))
    )
  order by j.created_at desc
  limit p_limit;
$$ language sql stable security definer;

grant execute on function public.get_seo_related_jobs(text[], text[], text, boolean, integer) to authenticated, anon;

-- ---------------------------------------------------------
-- 5) Seed 22 kategori jasa + generate landing page (generic + per-kota
--    untuk layanan lokal/tatap-muka) -- pakai DO block supaya tidak perlu
--    tulis manual ~130 baris INSERT satu-satu.
-- ---------------------------------------------------------
do $$
declare
  -- Konfigurasi tiap layanan: slug dasar, nama tampil, kategori jobs yang
  -- cocok (job_category_match), kata kunci judul (keyword_match),
  -- apakah layanan ini bisa remote (skip halaman per-kota kalau true).
  services jsonb := '[
    {"slug":"jasa-tukang-terdekat","name":"Jasa Tukang","h1":"Jasa Tukang Terdekat","category_match":["Perbaikan Rumah"],"keywords":["tukang"],"remote":false},
    {"slug":"jasa-bersih-rumah","name":"Jasa Bersih Rumah","h1":"Jasa Bersih Rumah Terpercaya","category_match":["Bersih-bersih Rumah"],"keywords":["bersih rumah","cleaning","bersih-bersih"],"remote":false},
    {"slug":"jasa-antar-jemput","name":"Jasa Antar Jemput","h1":"Jasa Antar Jemput Terdekat","category_match":["Antar Jemput / Kurir"],"keywords":["antar jemput","kurir"],"remote":false},
    {"slug":"jasa-jaga-kebun","name":"Jasa Jaga Kebun","h1":"Jasa Jaga Kebun & Tukang Taman","category_match":["Tukang Kebun"],"keywords":["kebun","taman"],"remote":false},
    {"slug":"jasa-bantuan-dokumen-dan-perizinan","name":"Jasa Bantuan Dokumen dan Perizinan","h1":"Jasa Bantuan Dokumen dan Perizinan","category_match":["Pengurusan Dokumen","Bantuan Perizinan"],"keywords":["dokumen","perizinan","izin"],"remote":false},
    {"slug":"jasa-driver-pribadi","name":"Jasa Driver Pribadi","h1":"Jasa Driver Pribadi Terpercaya","category_match":["Antar Jemput / Kurir"],"keywords":["driver","supir"],"remote":false},
    {"slug":"jasa-babysitter","name":"Jasa Babysitter","h1":"Jasa Babysitter & Pengasuh Anak","category_match":[],"keywords":["babysitter","pengasuh anak","pengasuh bayi"],"remote":false},
    {"slug":"jasa-teknisi","name":"Jasa Teknisi","h1":"Jasa Teknisi Perbaikan Terdekat","category_match":["Perbaikan Rumah"],"keywords":["teknisi","servis","perbaikan"],"remote":false},
    {"slug":"jasa-laundry","name":"Jasa Laundry","h1":"Jasa Laundry Terdekat","category_match":[],"keywords":["laundry","cuci baju","cuci sepatu"],"remote":false},
    {"slug":"jasa-freelance","name":"Jasa Freelance","h1":"Jasa Freelance Profesional","category_match":["Admin & Data Entry","Desain & Konten Digital"],"keywords":["freelance","freelancer"],"remote":true},
    {"slug":"jasa-joki-game","name":"Jasa Joki Game","h1":"Jasa Joki Game Terpercaya","category_match":["Joki Game"],"keywords":["joki"],"remote":true},
    {"slug":"jasa-joki-mobile-legends","name":"Jasa Joki Mobile Legends","h1":"Jasa Joki Mobile Legends Naik Rank","category_match":["Joki Game"],"keywords":["mobile legend","mobile legends"," ml "],"remote":true},
    {"slug":"jasa-joki-free-fire","name":"Jasa Joki Free Fire","h1":"Jasa Joki Free Fire Naik Rank","category_match":["Joki Game"],"keywords":["free fire"," ff "],"remote":true},
    {"slug":"jasa-joki-pubg","name":"Jasa Joki PUBG","h1":"Jasa Joki PUBG Mobile","category_match":["Joki Game"],"keywords":["pubg"],"remote":true},
    {"slug":"jasa-joki-genshin-impact","name":"Jasa Joki Genshin Impact","h1":"Jasa Joki Genshin Impact","category_match":["Joki Game"],"keywords":["genshin"],"remote":true},
    {"slug":"jasa-mabar-game","name":"Jasa Mabar Game","h1":"Jasa Mabar Game Bareng Pro Player","category_match":["Mabar Game"],"keywords":["mabar"],"remote":true},
    {"slug":"jasa-top-up-game","name":"Jasa Top Up Game","h1":"Jasa Top Up Game Murah & Cepat","category_match":[],"keywords":["top up","topup"],"remote":true},
    {"slug":"jasa-desain-grafis","name":"Jasa Desain Grafis","h1":"Jasa Desain Grafis Profesional","category_match":["Desain & Konten Digital"],"keywords":["desain grafis","design grafis"],"remote":true},
    {"slug":"jasa-website","name":"Jasa Website","h1":"Jasa Pembuatan Website","category_match":["Desain & Konten Digital"],"keywords":["website","web developer"],"remote":true},
    {"slug":"jasa-digital-marketing","name":"Jasa Digital Marketing","h1":"Jasa Digital Marketing & Sosial Media","category_match":["Desain & Konten Digital"],"keywords":["digital marketing","social media"],"remote":true},
    {"slug":"jasa-edit-video","name":"Jasa Edit Video","h1":"Jasa Edit Video Profesional","category_match":["Fotografi & Video"],"keywords":["edit video","video editor"],"remote":true},
    {"slug":"jasa-fotografi","name":"Jasa Fotografi","h1":"Jasa Fotografi Profesional","category_match":["Fotografi & Video"],"keywords":["fotografi","fotografer"],"remote":true}
  ]'::jsonb;

  -- Klaster relasi "Lihat juga" -- dikelompokkan berdasarkan kemiripan
  -- kebutuhan pengguna (rumah tangga, gaming/joki, digital).
  clusters jsonb := '[
    ["jasa-tukang-terdekat","jasa-bersih-rumah","jasa-jaga-kebun","jasa-teknisi"],
    ["jasa-bersih-rumah","jasa-tukang-terdekat","jasa-laundry","jasa-babysitter"],
    ["jasa-antar-jemput","jasa-driver-pribadi"],
    ["jasa-jaga-kebun","jasa-tukang-terdekat","jasa-bersih-rumah"],
    ["jasa-bantuan-dokumen-dan-perizinan","jasa-freelance"],
    ["jasa-driver-pribadi","jasa-antar-jemput"],
    ["jasa-babysitter","jasa-bersih-rumah","jasa-laundry"],
    ["jasa-teknisi","jasa-tukang-terdekat"],
    ["jasa-laundry","jasa-bersih-rumah","jasa-babysitter"],
    ["jasa-freelance","jasa-desain-grafis","jasa-website","jasa-digital-marketing"],
    ["jasa-joki-game","jasa-joki-mobile-legends","jasa-joki-free-fire","jasa-joki-pubg","jasa-joki-genshin-impact","jasa-mabar-game"],
    ["jasa-joki-mobile-legends","jasa-joki-game","jasa-mabar-game"],
    ["jasa-joki-free-fire","jasa-joki-game","jasa-mabar-game"],
    ["jasa-joki-pubg","jasa-joki-game","jasa-mabar-game"],
    ["jasa-joki-genshin-impact","jasa-joki-game","jasa-top-up-game"],
    ["jasa-mabar-game","jasa-joki-game","jasa-joki-mobile-legends"],
    ["jasa-top-up-game","jasa-joki-game","jasa-mabar-game"],
    ["jasa-desain-grafis","jasa-website","jasa-digital-marketing","jasa-edit-video"],
    ["jasa-website","jasa-desain-grafis","jasa-digital-marketing"],
    ["jasa-digital-marketing","jasa-desain-grafis","jasa-website"],
    ["jasa-edit-video","jasa-fotografi","jasa-desain-grafis"],
    ["jasa-fotografi","jasa-edit-video","jasa-desain-grafis"]
  ]'::jsonb;

  svc jsonb;
  city record;
  v_category_id uuid;
  v_slug text;
  v_lp_id uuid;
  v_h1 text;
  v_desc text;
  v_content text;
  v_meta_desc text;
begin
  -- (a) Seed kategori + landing page GENERIC (tanpa kota) per layanan
  for svc in select * from jsonb_array_elements(services)
  loop
    insert into seo_categories (name, slug, job_category_match, keyword_match, remote_service)
    values (
      svc->>'name',
      svc->>'slug',
      (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(svc->'category_match') x),
      (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(svc->'keywords') x),
      (svc->>'remote')::boolean
    )
    on conflict (slug) do update set
      job_category_match = excluded.job_category_match,
      keyword_match = excluded.keyword_match,
      remote_service = excluded.remote_service
    returning id into v_category_id;

    v_h1 := svc->>'h1';
    v_desc := format('Cari %s? Temukan pekerja lepas terpercaya di KerjaHub -- pesan langsung, bayar aman lewat escrow, dan pantau progresnya sampai selesai.', lower(svc->>'name'));
    v_meta_desc := format('%s tersedia di KerjaHub. Pesan langsung, harga transparan, pembayaran aman lewat escrow. Cari %s terdekat sekarang.', v_h1, lower(svc->>'name'));
    v_content := format(
      '<h2>Kenapa Pilih %1$s di KerjaHub?</h2>' ||
      '<ul><li>Pekerja terverifikasi KYC</li><li>Harga bisa dinego langsung dengan penyedia jasa</li><li>Pembayaran aman lewat sistem escrow -- dana baru cair setelah pekerjaan selesai</li><li>Bisa chat langsung sebelum deal</li></ul>' ||
      '<h2>Cara Kerja</h2>' ||
      '<ol><li>Cari %1$s sesuai kebutuhan di KerjaHub</li><li>Hubungi/chat penyedia jasa, sepakati harga & jadwal</li><li>Bayar lewat sistem escrow KerjaHub (dana ditahan aman)</li><li>Pekerjaan selesai, dana otomatis cair ke penyedia jasa</li></ol>' ||
      '<h2>Manfaat Pakai KerjaHub</h2>' ||
      '<p>Semua transaksi tercatat, ada sistem rating & ulasan, dan tim support siap bantu kalau ada kendala -- jadi lebih tenang dibanding cari %2$s lewat grup media sosial atau tanya tetangga.</p>',
      v_h1, lower(svc->>'name')
    );

    insert into seo_landing_pages (title, slug, h1, hero_title, hero_description, content, meta_title, meta_description, meta_keywords, category_id, status, publish_date)
    values (
      v_h1, svc->>'slug', v_h1,
      format('Temukan %s Terpercaya di KerjaHub', lower(svc->>'name')),
      v_desc,
      v_content,
      v_h1,
      v_meta_desc,
      array_to_string((select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(svc->'keywords') x) || array[lower(svc->>'name')], ', '),
      v_category_id, 'published', now()
    )
    on conflict (slug) do nothing
    returning id into v_lp_id;

    if v_lp_id is not null then
      insert into seo_faqs (landing_page_id, question, answer, sort_order) values
        (v_lp_id, format('Berapa biaya %s di KerjaHub?', lower(svc->>'name')), 'Biaya bervariasi tergantung kompleksitas pekerjaan dan penyedia jasa -- kamu bisa lihat harga & nego langsung sebelum deal di setiap postingan.', 0),
        (v_lp_id, format('Apakah %s di KerjaHub aman?', lower(svc->>'name')), 'Aman -- pembayaran memakai sistem escrow, dana ditahan dan baru cair ke penyedia jasa setelah pekerjaan kamu konfirmasi selesai.', 1),
        (v_lp_id, format('Bagaimana cara pesan %s?', lower(svc->>'name')), 'Cari postingan yang sesuai kebutuhanmu di halaman ini, chat penyedia jasa lewat KerjaHub, sepakati harga, lalu bayar lewat sistem escrow.', 2);
    end if;

    -- (b) Landing page PER KOTA -- cuma untuk layanan yang sifatnya
    -- lokal/tatap-muka (remote_service = false)
    if not (svc->>'remote')::boolean then
      for city in select l.id, l.slug, l.name from seo_locations l where l.slug in
        ('jakarta','bandung','surabaya','bekasi','depok','bogor','semarang','medan','yogyakarta','makassar')
      loop
        v_slug := (svc->>'slug') || '-' || city.slug;
        -- Slug generic sudah termasuk "-terdekat" di beberapa layanan (mis.
        -- jasa-tukang-terdekat) -- untuk kerapian URL kota, kita pakai nama
        -- dasar tanpa "-terdekat" sebagai awalan. Cukup pakai h1 sebagai
        -- dasar teks, slug tetap dari svc->>'slug' + kota (URL tetap unik &
        -- valid meskipun sedikit panjang, mis. "jasa-tukang-terdekat-bandung").
        v_h1 := format('%s %s', svc->>'h1', city.name);
        v_meta_desc := format('%s di %s tersedia di KerjaHub. Pesan langsung, harga transparan, pembayaran aman lewat escrow.', svc->>'h1', city.name);
        v_content := format(
          '<h2>%1$s di %2$s</h2><p>KerjaHub menghubungkan kamu dengan penyedia %3$s terpercaya di %2$s dan sekitarnya.</p>' ||
          '<h2>Kenapa Pilih KerjaHub di %2$s?</h2>' ||
          '<ul><li>Pekerja terverifikasi KYC di area %2$s</li><li>Harga bisa dinego langsung</li><li>Pembayaran aman lewat escrow</li></ul>' ||
          '<h2>Cara Kerja</h2>' ||
          '<ol><li>Cari %3$s di %2$s lewat KerjaHub</li><li>Chat & sepakati harga dengan penyedia jasa</li><li>Bayar lewat escrow, dana cair setelah selesai</li></ol>',
          svc->>'h1', city.name, lower(svc->>'name')
        );

        insert into seo_landing_pages (title, slug, h1, hero_title, hero_description, content, meta_title, meta_description, meta_keywords, category_id, location_id, status, publish_date)
        values (
          v_h1, v_slug, v_h1,
          format('%s Terpercaya di %s', svc->>'name', city.name),
          format('Cari %s di %s? KerjaHub menyediakan pekerja lepas terverifikasi, siap bantu kebutuhanmu.', lower(svc->>'name'), city.name),
          v_content, v_h1, v_meta_desc,
          array_to_string((select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(svc->'keywords') x) || array[lower(svc->>'name') || ' ' || lower(city.name)], ', '),
          v_category_id, city.id, 'published', now()
        )
        on conflict (slug) do nothing
        returning id into v_lp_id;

        if v_lp_id is not null then
          insert into seo_faqs (landing_page_id, question, answer, sort_order) values
            (v_lp_id, format('Apakah ada %s di %s?', lower(svc->>'name'), city.name), format('Ada -- KerjaHub punya penyedia jasa aktif di %s dan sekitarnya, bisa langsung kamu hubungi lewat halaman ini.', city.name), 0),
            (v_lp_id, format('Berapa biaya %s di %s?', lower(svc->>'name'), city.name), 'Biaya bervariasi tergantung penyedia jasa dan kompleksitas pekerjaan -- bisa dinego langsung sebelum deal.', 1);
        end if;
      end loop;
    end if;
  end loop;

  -- (c) Relasi antar-kategori buat "Lihat juga"
  declare
    cluster jsonb;
    main_slug text;
    rel_slug text;
    v_main_id uuid;
    v_rel_id uuid;
  begin
    for cluster in select * from jsonb_array_elements(clusters)
    loop
      main_slug := cluster->>0;
      select id into v_main_id from seo_categories where slug = main_slug;
      if v_main_id is null then continue; end if;
      for rel_slug in select jsonb_array_elements_text(cluster) offset 1
      loop
        select id into v_rel_id from seo_categories where slug = rel_slug;
        if v_rel_id is not null then
          insert into seo_category_relations (category_id, related_category_id)
          values (v_main_id, v_rel_id)
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end;
end $$;
