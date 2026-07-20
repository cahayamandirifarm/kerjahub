# KerjaHub

Marketplace kerja yang menghubungkan **pemberi kerja** dan **pencari kerja** untuk
segala jenis pekerjaan — online maupun offline (tukang kebun, bersih-bersih,
antar-jemput, desain, dan lainnya). Dibangun dengan **Next.js 14** (App Router) +
**Supabase** (Auth, Database, Storage, Realtime).

## Fitur utama

- Beranda publik menampilkan penawaran kerja terbuka, tanpa perlu login
- Melamar pekerjaan otomatis mengarahkan ke login/registrasi
- Registrasi simpel: **username + kata sandi + nomor HP** (nomor HP hanya
  tampil di profil, tidak dipakai untuk login)
- Dompet saldo untuk pemberi kerja & pencari kerja
- Top up manual (transfer / QRIS) — **diverifikasi manual oleh admin**
- Penarikan saldo — biaya admin Rp10.000/transaksi (worker + biaya penarikan 5%)
- Komisi platform 10% otomatis dipotong saat pekerjaan selesai
- Postingan kerja otomatis "tertutup" begitu pelamar diterima (escrow) dan pindah
  ke status Selesai, tidak lagi tampil di listing terbuka
- Notifikasi otomatis: ada pelamar baru, lamaran diterima, penarikan disetujui, dll
- Chat dalam platform antara pemberi kerja & pekerja (realtime)
- Verifikasi KYC (upload KTP + selfie), wajib sebelum bertransaksi
- Panel admin terpisah (`/admin`) untuk kelola user, verifikasi KYC, verifikasi
  top up & penarikan, monitor postingan, laporan komisi
- Data demo: superadmin + 4 akun contoh + 5 pekerjaan contoh

## Struktur teknis

- `app/` — halaman Next.js App Router
- `app/register`, `app/login` — registrasi & login username/password
- `app/admin/` — panel admin (login terpisah dengan email, dilindungi role `admin`)
- `lib/supabase/` — helper client Supabase (browser & server)
- `lib/auth-helpers.ts` — konversi username ↔ email internal untuk Supabase Auth
- `supabase/migrations/0001_init.sql` — skema database lengkap + RLS + business logic
- `supabase/seed.sql` — data demo (superadmin, akun contoh, pekerjaan contoh)

### Cara kerja login username (teknis)

Supabase Auth secara native butuh format email. Karena registrasi di sini
sengaja dibuat simpel (username + password + HP saja, tanpa email), setiap
username otomatis dipetakan ke email internal
`<username>@users.kerjahub.internal` yang tidak pernah ditampilkan ke
pengguna (lihat `lib/auth-helpers.ts`). Keunikan username terjamin karena
`auth.users.email` bersifat unik di Supabase — kalau username sudah dipakai,
proses daftar otomatis gagal.

---

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com) (kalau ini project
   yang sudah ada dari versi sebelumnya, langsung lanjut ke langkah 2 — tidak
   perlu buat project baru).
2. Buka **SQL Editor**, jalankan **berurutan** (jangan dibalik):
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_features.sql` — migrasi ini mengaktifkan
      PostGIS, mengubah alur status pekerjaan, escrow, KYC selfie-only,
      rating, audit log, dan fitur lokasi. **Wajib** dijalankan meski
      project sudah pernah menjalankan `0001_init.sql` sebelumnya.
   3. `supabase/seed.sql` — data demo (opsional, tapi disarankan).
3. Buka **Authentication → Providers → Email**:
   - Pastikan provider **Email** aktif.
   - **Matikan "Confirm email"**. Ini penting — karena registrasi di app
     langsung login otomatis setelah daftar tanpa proses klik link
     verifikasi email (email-nya kan email internal, tidak bisa dibuka user).
4. Buka **Authentication → URL Configuration**, set Site URL ke
   `http://localhost:3000` (ganti ke domain produksi saat deploy).
5. Cek **Storage**: 4 bucket (`kyc-docs`, `payment-proofs`, `avatars`,
   `job-photos`) sudah otomatis dibuat oleh migration.
6. Cek **Database → Replication**: tabel `notifications` seharusnya sudah
   otomatis masuk ke publication `supabase_realtime` (dilakukan oleh
   `0002_features.sql`) — ini yang membuat popup notifikasi real-time
   berfungsi. Kalau popup tidak muncul, cek tabel ini ada di
   Replication → supabase_realtime.
7. Ambil `Project URL`, `anon public key` (disebut **Publishable key** di
   Supabase versi baru), dan `service_role key` (disebut **Secret key**) dari
   **Project Settings → API Keys** untuk langkah berikutnya.

## 2. Setup lokal

```bash
npm install
cp .env.example .env.local
# isi .env.local dengan URL & key dari Supabase
npm run dev
```

Buka `http://localhost:3000`.

## 3. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: KerjaHub marketplace"
git branch -M main
git remote add origin https://github.com/<username>/kerjahub.git
git push -u origin main
```

## 4. Deploy (disarankan Vercel)

1. Import repo GitHub di [vercel.com](https://vercel.com/new).
2. Tambahkan environment variables yang sama seperti `.env.local`.
3. Deploy. Setelah dapat domain, update **Site URL** di Supabase Authentication
   → URL Configuration ke domain produksi (`https://domainmu.vercel.app`).

## 5. Akun demo

| Peran | Username | Password |
|---|---|---|
| Superadmin (panel `/admin`, login pakai email) | `admin@kerjahub.demo` | `Demo1234!` |
| Pemberi Kerja (saldo terisi) | `employer1` | `Demo1234!` |
| Pemberi Kerja | `employer2` | `Demo1234!` |
| Pencari Kerja (KYC terverifikasi) | `worker1` | `Demo1234!` |
| Pencari Kerja (KYC menunggu) | `worker2` | `Demo1234!` |

Login akun demo di atas lewat halaman biasa `/login` pakai kolom **username**
(bukan email). Panel admin login lewat `/admin-login` pakai **email**
superadmin. Pengguna baru bisa daftar sendiri lewat `/register`.

5 pekerjaan demo (tukang kebun, bersih-bersih, kurir, desain logo, jasa taman)
otomatis tampil di beranda setelah `seed.sql` dijalankan.

## 6. Alur bisnis penting (sudah dihandle otomatis di database)

- **Melamar kerja**: pengunjung publik yang klik "Lamar" tanpa login akan
  diarahkan ke `/login`, lalu kembali ke halaman pekerjaan setelah berhasil.
- **Terima pelamar** (`accept_applicant`): status lamaran langsung jadi
  "Diterima", lalu sistem membuat tagihan escrow dengan **nominal unik 3
  digit** (nilai kerja + kode acak, mis. Rp500.000 → Rp500.347) supaya admin
  mudah mencocokkan mutasi rekening. Saldo pemberi kerja BELUM dipotong di
  tahap ini — employer diarahkan ke halaman pembayaran escrow.
- **Bayar & konfirmasi**: employer transfer manual + upload bukti →
  `submit_escrow_proof()` → admin verifikasi di `/admin/escrow` →
  `admin_confirm_escrow()` mengubah status job jadi "Dana Diamankan".
- **Mulai bekerja** (`start_work`): begitu dana diamankan, pekerja menekan
  tombol "Mulai Bekerja" di `/dashboard/job/[id]` — otomatis membuka
  WhatsApp pemberi kerja dengan pesan template siap kirim.
- **Selesai & konfirmasi**: pekerja wajib upload 1-10 foto hasil kerja lalu
  `submit_job_completion()`. Pemberi kerja meninjau di halaman yang sama:
  **Setujui** (dengan rating 1-5 + ulasan) via `approve_completion()` — upah
  otomatis cair ke saldo pekerja dikurangi komisi platform (default 10%,
  bisa diubah admin) — atau **Minta Revisi** via `request_revision()`.
- **Tarik saldo**: fungsi `request_withdrawal()` memotong saldo di muka
  (menunggu approval admin); jika ditolak admin, saldo dikembalikan otomatis.
  Biaya admin Rp10.000 untuk semua, ditambah persentase khusus pencari kerja
  (default 5%) — kedua angka ini bisa diubah admin di `/admin/settings`
  tanpa deploy ulang.
- **Top up saldo umum** (di luar escrow, untuk buffer dompet): employer
  upload bukti transfer/QRIS → admin verifikasi di `/admin/deposits`.
- **Lokasi & radius**: `nearby_jobs()` dan `nearby_workers()` memakai
  PostGIS (`ST_DWithin`, `ST_Distance`) — koordinat mentah pengguna lain
  TIDAK pernah dikirim ke browser, hanya jarak dan nama wilayah.

## Fitur v2 (escrow, notifikasi real-time, lokasi)

Ditambahkan di atas fondasi awal:
- Session persisten + status Masuk/Keluar otomatis di navbar + avatar
- KYC selfie-only (KTP dihapus dari alur)
- Notifikasi real-time: popup toast (kanan atas desktop / atas layar mobile),
  suara (dibangkitkan langsung di browser, tanpa file audio eksternal),
  badge unread di ikon lonceng, "Tandai Semua Sudah Dibaca" di halaman
  `/notifications`. Suara bisa dimatikan per akun di halaman `/kyc`.
- Rating & ulasan tersimpan di profil pekerja (`rating_avg`, `rating_count`,
  `completed_jobs_count`)
- Audit log semua aksi penting (`audit_log` table, dilihat admin di
  `/admin/audit-log`)
- Admin bisa atur radius pencarian, aktif/nonaktifkan Nearby, fee platform,
  biaya penarikan, satuan jarak, dan teks banner situs — semua dari
  `/admin/settings`, berlaku langsung tanpa redeploy

### Belum sepenuhnya dibangun (perlu iterasi lanjutan bila dibutuhkan)
- Menu admin "Pengaturan API", "Laporan Pengguna" (tiket bantuan), dan
  "Banner & Splash Screen" versi visual — saat ini baru tersedia sebagai
  baris pengaturan teks sederhana (`site_banner_text`) di `/admin/settings`,
  belum ada halaman upload gambar splash screen.
- Deteksi "aktivitas login mencurigakan" belum diimplementasikan (butuh
  infrastruktur tambahan seperti rate-limiting per IP).
- Status "online" pekerja saat ini berbasis heartbeat sederhana di
  browser (bukan WebSocket presence), cukup akurat untuk skala kecil-menengah.

## Catatan produksi

- Ganti nomor rekening placeholder demo (BCA 8800112233) di
  `/admin/bank-accounts` dengan rekening asli sebelum go-live.
- Untuk volume transaksi besar, pertimbangkan integrasi payment gateway resmi
  (Midtrans/Xendit) menggantikan verifikasi manual.
- Tinjau kembali kebijakan RLS di `0001_init.sql` sebelum go-live, sesuaikan
  dengan kebutuhan privasi data pengguna.

---

## 7. Update besar berikutnya: PWA, Top Up Terstruktur, Marketplace Digital

### Migration tambahan (jalankan urut setelah 0001-0002)
- `supabase/migrations/0003_topup_pwa.sql` — tabel `topup_requests`, `payment_settings` (rekening + QRIS admin), `wallet_transactions`, realtime untuk `topup_requests`, bucket storage `payment-settings`.
- `supabase/migrations/0004_marketplace_digital_banners.sql` — kolom `jobs.is_active`, tabel `banners`, dan seluruh sistem **Marketplace Digital**: `digital_listings`, `digital_orders` (escrow terpisah dengan kode unik sendiri), `digital_disputes`, realtime untuk order & listing.
- `supabase/migrations/0005_marketplace_fixes.sql` — perbaikan kecil skema marketplace.
- `supabase/migrations/0006_chat_system.sql` — **WAJIB untuk fitur Chat**: memperluas `conversations` (source_type, order_id, is_dispute, is_locked), tabel `conversation_members`, `message_reads`, `attachments`, `blocked_users`, `disputes`, trigger otomatis, bucket storage privat untuk lampiran chat.
- `supabase/migrations/0007_chat_ui_support.sql` — dukungan tambahan untuk UI chat (backfill percakapan marketplace lama).
- `supabase/migrations/0008_admin_chat.sql` — dashboard admin untuk chat & sengketa.
- `supabase/migrations/0009_push_notifications.sql` — push notification untuk chat.
- `supabase/migrations/0010_pre_deal_chat.sql` — kolom `listing_id`/`initiator_id` di `conversations`, RPC `start_listing_chat`, chat pra-order untuk listing marketplace.
- `supabase/migrations/0011_fix_conversation_members_recursion.sql` — **WAJIB**: memperbaiki bug "infinite recursion detected in policy for relation conversation_members" (policy SELECT lama query ke tabel dirinya sendiri). Tanpa ini, tap ke chat manapun akan gagal terbuka.
- `supabase/migrations/0012_chat_notifications.sql` — memperluas trigger pesan chat supaya SETIAP pesan baru (bukan cuma /tanyaadmin) membuat baris di tabel `notifications`, sehingga toast + bunyi "beep" di `NotificationContext` (saat app terbuka) juga berbunyi untuk chat biasa, bukan cuma sengketa admin.

⚠️ **Kalau menu Chat kebuka lalu langsung "mental" balik ke daftar chat (loading terus tanpa pernah menampilkan chat box):** hampir pasti karena migration `0006`–`0010` di atas **belum pernah dijalankan** di project Supabase produksi (redeploy Vercel TIDAK menjalankan migration secara otomatis — itu terpisah dari deployment aplikasi). Jalankan satu per satu lewat **Supabase Dashboard → SQL Editor** sesuai urutan nomornya, lalu reload schema cache dengan menjalankan:
```sql
select pg_notify('pgrst', 'reload schema');
```
(atau lewat Dashboard → Settings → API → "Reload schema"), supaya PostgREST mengenali kolom/tabel baru. Tanpa langkah reload ini, query yang menyentuh tabel/kolom baru akan gagal walau migration sudah dijalankan.

### Setup Push Notification (WAJIB untuk notif bar + suara saat PWA di-background/ditutup)
Infrastrukturnya sudah lengkap di kode (migration `0009`, `lib/push.ts`, `public/service-worker.js`, `supabase/functions/send-chat-push`), TAPI belum aktif sampai langkah-langkah ini dijalankan sekali di awal — kalau belum, chat masuk hanya akan bunyi+toast saat app **sedang dibuka** (lewat migration `0012` di atas), tapi TIDAK muncul di notification bar HP saat app di-background atau ditutup.

1. **Generate VAPID key pair** (sekali saja, simpan baik-baik):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Hasilnya sepasang Public Key & Private Key.

2. **Set environment variable di Vercel** (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = Public Key dari langkah 1
   Lalu redeploy supaya kebaca.

3. **Deploy Edge Function ke Supabase** (butuh [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase functions deploy send-chat-push
   ```

4. **Set secrets untuk Edge Function itu:**
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=xxxx VAPID_PRIVATE_KEY=xxxx VAPID_SUBJECT="mailto:admin@kerjahub.app"
   supabase secrets set SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx
   ```
   `PUSH_WEBHOOK_SECRET` **harus sama persis** dengan isi kolom `webhook_secret` di tabel `push_config` (sudah otomatis digenerate migration `0009`) — cek nilainya:
   ```sql
   select webhook_secret from push_config;
   ```
   lalu set:
   ```bash
   supabase secrets set PUSH_WEBHOOK_SECRET=<hasil query di atas>
   ```

5. **Isi `function_url` di `push_config`** dengan URL Edge Function yang baru dideploy (dari output langkah 3, formatnya `https://xxxx.supabase.co/functions/v1/send-chat-push`):
   ```sql
   update push_config set function_url = 'https://xxxx.supabase.co/functions/v1/send-chat-push';
   ```

6. **Aktifkan di HP** — buka app → menu **Akun** → toggle **"Notifikasi push"** (di halaman `/kyc`). Browser akan minta izin notifikasi; setelah diizinkan, device itu terdaftar. Ulangi per perangkat/akun yang mau menerima notif bar.

Setelah 6 langkah ini, kirim pesan chat dari akun lain saat app di-background/ditutup di HP penerima → seharusnya muncul di notification bar HP lengkap dengan bunyi notifikasi bawaan sistem (Android/Chrome memutar bunyi notifikasi otomatis untuk setiap `showNotification`, tidak perlu file suara custom).

### PWA
- `public/manifest.json`, `public/service-worker.js`, `public/offline.html`, ikon di `public/icons/`
- Service worker didaftarkan otomatis lewat `components/PWAInstall.tsx` (dipasang di `app/layout.tsx`) — meng-cache app shell & aset statis, fallback ke `offline.html` saat tidak ada koneksi
- Tombol "Install App" muncul otomatis di perangkat yang mendukung (Android/desktop Chrome). iOS Safari tidak punya event `beforeinstallprompt` — user iOS install manual lewat menu Share → "Add to Home Screen" (batasan platform, bukan bug)
- **Ikon PWA saat ini masih placeholder** (huruf "K" polos) — ganti `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` dengan logo asli sebelum go-live

### Alur Top Up baru (menggantikan alur lama secara paralel)
- Tombol **"Top Up"** di dashboard sekarang membuka modal (`components/TopUpModal.tsx`) → generate kode unik 3 digit via `create_topup_request()` → tampilkan nominal final + rekening + QRIS dari `payment_settings` → tombol Salin Nominal/Rekening → "Saya Sudah Transfer"
- Admin konfirmasi di **`/admin/topup-requests`** (realtime, live update tanpa refresh) → `admin_review_topup()` menambah saldo & mencatat ke `wallet_transactions`
- Admin atur rekening & QRIS di **`/admin/payment-settings`**
- Menu lama `/admin/deposits` dan `/dashboard/employer/withdraw?tab=topup` masih ada (ditandai "(Lama)") untuk kompatibilitas mundur, tidak wajib dipakai

### Marketplace Digital (jual-beli akun & produk digital)
- Publik: `/marketplace` (browse per kategori), `/marketplace/[id]` (detail + beli), `/marketplace/post` (jual produk, wajib 1-5 foto)
- Alur mengikuti pola escrow yang sama seperti pekerjaan: bayar dengan kode unik → admin konfirmasi (`/admin/marketplace-orders`, realtime) → dana diamankan → penjual upload bukti serah terima → pembeli upload bukti terima → **begitu KEDUA pihak konfirmasi**, dana otomatis cair ke penjual (dikurangi komisi platform)
- Sengketa: tombol "Buka Sengketa" (masuk ke `digital_disputes`, admin lihat di `/admin/marketplace-orders`) + tombol **"Diskusi via WhatsApp Admin"** yang membuka chat langsung ke nomor admin (`6285178509892`)
- ⚠️ **Catatan penting**: pembuatan grup WhatsApp otomatis (auto-invite admin ke grup) **tidak diimplementasikan** karena secara teknis membutuhkan WhatsApp Business API berbayar dengan proses verifikasi bisnis — link `wa.me` gratis hanya mendukung membuka chat 1-ke-1. Yang tersedia adalah tombol chat langsung ke admin sebagai gantinya.
- Kelola listing (aktifkan/nonaktifkan/hapus) di `/admin/marketplace-listings`

### Banner slider
- Kelola di `/admin/banners`: upload, urutkan (↑↓), aktif/nonaktif, hapus
- Tampil otomatis di beranda (`components/BannerCarousel.tsx`) — auto-slide tiap 5 detik, ada indikator titik & tombol panah, responsif mobile, klik banner mengarah ke `link_url` kalau diisi

### Kelola postingan kerja
- Admin bisa **Aktifkan/Nonaktifkan** (soft, postingan hilang dari beranda tapi datanya tetap ada) atau **Hapus Permanen** di `/admin/jobs`

### Tampilan saldo
- Kartu saldo di dashboard sekarang pakai kontras tinggi: latar `#0f172a`, teks putih tebal 32px, supaya nominal jelas terbaca di kondisi cahaya apapun
