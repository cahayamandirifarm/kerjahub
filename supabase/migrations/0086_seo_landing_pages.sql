-- =========================================================
-- KERJAHUB — MIGRATION 0086: SEO LANDING PAGE
--
-- Fitur baru, TIDAK mengubah tabel/fitur yang sudah ada. Landing page
-- SEO ini punya sistem sendiri (tabel seo_*), diakses lewat:
--   - Publik: app/[slug]/page.tsx (SSR + ISR) -- slug custom bebas
--     ditentukan admin, TANPA prefix /landing/.
--   - Admin:  /admin/seo/landing-pages, /admin/seo/redirect,
--             /admin/seo/settings (menu baru, tidak sentuh menu lain).
--
-- Jalankan SETELAH semua migration lain (paling akhir).
-- =========================================================

-- ---------------------------------------------------------
-- 1) KATEGORI & DAERAH (buat filter admin + tag landing page,
--    BUKAN dipakai ulang dari kategori jasa/pekerjaan yang sudah ada --
--    sengaja dipisah supaya nama kategori SEO bebas beda dari kategori
--    di jasa/marketplace tanpa risiko konflik data)
-- ---------------------------------------------------------
create table if not exists seo_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists seo_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table seo_categories enable row level security;
alter table seo_locations enable row level security;
create policy "Semua orang bisa lihat kategori SEO" on seo_categories for select using (true);
create policy "Hanya admin kelola kategori SEO" on seo_categories for all using (public.is_admin()) with check (public.is_admin());
create policy "Semua orang bisa lihat daerah SEO" on seo_locations for select using (true);
create policy "Hanya admin kelola daerah SEO" on seo_locations for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 2) LANDING PAGE
-- ---------------------------------------------------------
create type seo_landing_status as enum ('draft', 'published');

create table if not exists seo_landing_pages (
  id uuid primary key default uuid_generate_v4(),

  -- Konten utama
  title text not null,
  slug text not null unique, -- contoh: "jasa-antar-jemput-bandung" -> diakses di /jasa-antar-jemput-bandung
  h1 text not null,
  hero_title text,
  hero_description text,
  content text, -- HTML dari rich text editor admin

  -- Meta SEO
  meta_title text,
  meta_description text,
  meta_keywords text,
  canonical_url text,
  og_image text,
  schema_json jsonb, -- kalau diisi manual admin, dipakai apa adanya; kalau kosong, di-generate otomatis dari field lain (lihat lib/seo-helpers.ts)

  -- Taksonomi
  category_id uuid references seo_categories(id) on delete set null,
  location_id uuid references seo_locations(id) on delete set null,
  featured boolean not null default false,

  -- CTA & related
  cta_text text,
  cta_link text,
  related_ids uuid[] not null default '{}',

  -- Publikasi
  status seo_landing_status not null default 'draft',
  publish_date timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_landing_pages_status_idx on seo_landing_pages(status);
create index if not exists seo_landing_pages_category_idx on seo_landing_pages(category_id);
create index if not exists seo_landing_pages_location_idx on seo_landing_pages(location_id);

create or replace function public.set_seo_landing_pages_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_seo_landing_pages_updated_at on seo_landing_pages;
create trigger trg_seo_landing_pages_updated_at
  before update on seo_landing_pages
  for each row execute procedure public.set_seo_landing_pages_updated_at();

alter table seo_landing_pages enable row level security;

-- Publik hanya boleh baca yang sudah published & tanggal publish sudah lewat
-- (atau kosong = langsung tayang begitu status diubah ke published).
create policy "Publik bisa lihat landing page yang sudah terbit" on seo_landing_pages
  for select using (
    status = 'published' and (publish_date is null or publish_date <= now())
  );

-- Admin boleh lihat & kelola SEMUA (termasuk draft, buat keperluan preview).
create policy "Admin kelola semua landing page" on seo_landing_pages
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 3) FAQ per landing page
-- ---------------------------------------------------------
create table if not exists seo_faqs (
  id uuid primary key default uuid_generate_v4(),
  landing_page_id uuid not null references seo_landing_pages(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists seo_faqs_landing_page_idx on seo_faqs(landing_page_id);

alter table seo_faqs enable row level security;
create policy "Publik bisa lihat FAQ landing page terbit" on seo_faqs
  for select using (
    exists (
      select 1 from seo_landing_pages lp
      where lp.id = seo_faqs.landing_page_id
        and lp.status = 'published'
        and (lp.publish_date is null or lp.publish_date <= now())
    )
  );
create policy "Admin kelola semua FAQ landing page" on seo_faqs
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 4) REDIRECT (mis. slug lama dipindah/dihapus -> arahkan ke slug baru)
-- ---------------------------------------------------------
create table if not exists seo_redirects (
  id uuid primary key default uuid_generate_v4(),
  from_path text not null unique, -- contoh: "/jasa-lama-bandung" (harus diawali "/")
  to_path text not null,          -- contoh: "/jasa-antar-jemput-bandung" atau URL penuh
  status_code integer not null default 301 check (status_code in (301, 302)),
  created_at timestamptz not null default now()
);

alter table seo_redirects enable row level security;
-- Publik perlu bisa baca (dicek dari halaman [slug] server-side, tanpa
-- login) supaya redirect benar-benar jalan buat pengunjung biasa. Data di
-- tabel ini cuma pemetaan URL, bukan data sensitif.
create policy "Publik bisa baca redirect" on seo_redirects for select using (true);
create policy "Admin kelola semua redirect" on seo_redirects for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 5) PENGATURAN SEO GLOBAL (1 baris, dipakai sebagai default/fallback)
-- ---------------------------------------------------------
create table if not exists seo_settings (
  id int primary key default 1,
  site_name text not null default 'KerjaHub',
  default_meta_title_suffix text not null default ' | KerjaHub',
  default_meta_description text,
  default_og_image text,
  google_site_verification text,
  robots_extra_rules text, -- baris tambahan bebas utk robots.txt, mis. "Disallow: /rahasia"
  updated_at timestamptz not null default now(),
  constraint seo_settings_single_row check (id = 1)
);
insert into seo_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.set_seo_settings_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_seo_settings_updated_at on seo_settings;
create trigger trg_seo_settings_updated_at
  before update on seo_settings
  for each row execute procedure public.set_seo_settings_updated_at();

alter table seo_settings enable row level security;
create policy "Publik bisa baca pengaturan SEO" on seo_settings for select using (true);
create policy "Admin kelola pengaturan SEO" on seo_settings for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- 6) STORAGE: bucket khusus OG image landing page
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('seo-og-images', 'seo-og-images', true)
  on conflict (id) do nothing;
create policy "OG image SEO publik bisa dilihat" on storage.objects for select using (bucket_id = 'seo-og-images');
create policy "Hanya admin upload OG image SEO" on storage.objects for insert with check (bucket_id = 'seo-og-images' and public.is_admin());
create policy "Hanya admin hapus OG image SEO" on storage.objects for delete using (bucket_id = 'seo-og-images' and public.is_admin());

-- ---------------------------------------------------------
-- 7) Cegah slug landing page bentrok dengan path yang sudah dipakai
--    aplikasi (mis. admin bikin slug "marketplace" -> akan ketiban rute
--    /marketplace yang sudah ada, karena Next.js selalu utamakan rute statis
--    di atas rute dinamis [slug], jadi landing page itu TIDAK PERNAH bisa
--    diakses -- baik divalidasi di sini di level DB, ATAUPUN di admin form.
-- ---------------------------------------------------------
create or replace function public.validate_seo_slug()
returns trigger as $$
begin
  if new.slug = any (array[
    'jobs', 'marketplace', 'dashboard', 'admin', 'login', 'register',
    'admin-login', 'kyc', 'chat', 'produk', 'notifications', 'api',
    'offline', 'manifest.json', 'sitemap.xml', 'robots.txt'
  ]) then
    raise exception 'Slug "%" dipakai oleh rute aplikasi -- pilih slug lain', new.slug;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_seo_slug on seo_landing_pages;
create trigger trg_validate_seo_slug
  before insert or update of slug on seo_landing_pages
  for each row execute procedure public.validate_seo_slug();
