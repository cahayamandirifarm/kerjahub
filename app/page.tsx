import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import NearbyJobsSection from "@/components/NearbyJobsSection";
import LocationPrompt from "@/components/LocationPrompt";
import SiteBanner from "@/components/SiteBanner";
import BannerCarousel from "@/components/BannerCarousel";
import { Job, JOB_CATEGORIES, categoriesForRole } from "@/lib/types";
import PostCTAButtons from "@/components/PostCTAButtons";
import ScrollToJobsButton from "@/components/ScrollToJobsButton";
import { categoryPostCopy } from "@/lib/category-copy";
import { getHomeJobs } from "@/lib/cached-queries";
import JobCard from "@/components/JobCard";
import { Wifi } from "lucide-react";

// CATATAN PERUBAHAN (update fitur beranda):
// Beranda TIDAK LAGI menampilkan daftar kartu postingan (jobs) langsung di
// halaman ini. Alasan: daftar itu diambil lewat getHomeJobs yang di-cache
// s.d. 30 menit (Next.js Data Cache) DAN sebelumnya dipasangkan dengan
// paginasi/guest-gate yang bikin halaman ini berat & gampang menampilkan
// data yang sudah basi (postingan yang baru dihapus/nonaktif tampak masih
// ada sampai cache kedaluwarsa). Supaya beranda selalu ringan dan tidak
// pernah menampilkan postingan yang sudah dihapus/nonaktif, beranda
// sekarang HANYA berisi (urutan tampil dari atas ke bawah):
//   1) Toggle "Saya Butuh Pekerja (Pemberi Upah)" / "Saya Butuh Pekerjaan
//      (Penerima Upah)" beserta menu/grid kategori di bawahnya --
//      mengarahkan ke halaman /kategori yang MENGAMBIL DATA LANGSUNG
//      (fresh, tidak di-cache lama) lewat RPC nearby_jobs/nearby_workers,
//      yang sudah memfilter is_active=true & stage='terbuka' di sisi
//      database, jadi postingan yang sudah dihapus/dinonaktifkan otomatis
//      tidak pernah ikut tampil.
//   2) Bagian "Lowongan & Pekerja Terdekat" (NearbyJobsSection) di
//      bawahnya -- lihat juga perbaikan cache di komponen tsb (TTL
//      diturunkan dari 7 hari jadi 15 menit, supaya postingan
//      terhapus/nonaktif tidak nyangkut lama di cache device pengguna).
//   3) Di bawah itu, bagian khusus "Penerima Upah -- Remote": daftar
//      postingan jasa (posted_by_role='worker', yaitu "Saya Butuh
//      Pekerjaan / Penerima Upah") yang is_remote=true saja. Diambil dari
//      getHomeJobs("worker", ...) yang sudah cache 30 menit di server DAN
//      sudah filter is_active=true & stage='terbuka', lalu di-filter lagi
//      is_remote=true di sini -- jadi postingan yang dihapus/nonaktif atau
//      bukan remote tidak ikut tampil.
// Daftar kartu postingan + paginasi + guest-gate yang tadinya ada di sini
// dihapus dari beranda (bukan dihapus dari aplikasi -- pencarian per
// kategori tetap ada di /kategori).
export const revalidate = 900;

export default async function HomePage({
  searchParams
}: {
  searchParams: { kategori?: string; tipe?: string };
}) {
  // Default saat pertama kali buka halaman (tanpa parameter ?tipe= di URL)
  // sekarang "Saya Butuh Pekerjaan (Penerima Upah)" -- baru pindah ke
  // "Saya Butuh Pekerja (Pemberi Upah)" kalau usernya klik tombol itu
  // (?tipe=kerja).
  const tipe = searchParams.tipe === "kerja" ? "employer" : "worker";

  // Postingan "Saya Butuh Pekerjaan (Penerima Upah)" khusus yang Remote --
  // ditampilkan di bagian tersendiri di bawah "Lowongan & Pekerja
  // Terdekat". getHomeJobs sudah cache 30 menit & sudah filter
  // is_active=true + stage='terbuka' di server -- di sini tinggal disaring
  // lagi is_remote=true, lalu dibatasi 10 kartu.
  const workerJobs = await getHomeJobs("worker").catch(() => null);
  const remoteWorkerJobs = ((workerJobs as Job[] | null) ?? []).filter((j) => j.is_remote).slice(0, 10);

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Navbar />
      <SiteBanner />
      <BannerCarousel />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-turquoise-light/60 via-paper to-paper -z-10" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand opacity-10 blur-3xl -z-10" />
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-10">
          <span className="badge-verified">Dompet aman, kerja tenang</span>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-[1.12] text-ink max-w-xl mt-4 animate-fade-up">
            Temukan Pekerja &amp; Pekerjaan Dengan Mudah
          </h1>
          <p className="mt-4 text-ink/60 max-w-lg text-base leading-relaxed">
            Platform terpercaya yang menghubungkan pekerja, freelancer, pemberi kerja, dan
            marketplace digital dalam satu ekosistem.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <ScrollToJobsButton />
            <a href="/marketplace" className="btn-brand">
              Jelajahi Marketplace
            </a>
          </div>

          <PostCTAButtons />
        </div>
      </section>

      <section id="daftar-kerja" className="max-w-5xl mx-auto px-4 scroll-mt-24">
        <h2 className="section-title mb-4">Jelajahi Peluang</h2>
        <div className="flex items-center gap-2 mb-3">
          <Link
            href={`/?tipe=jasa${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            scroll={false}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "worker" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Saya Butuh Pekerjaan (Penerima Upah)
          </Link>
          <Link
            href={`/?tipe=kerja${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            scroll={false}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "employer" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Saya Butuh Pekerja (Pemberi Upah)
          </Link>
        </div>

        <h3 className="font-display text-sm font-semibold text-ink/70 mb-3">Semua Kategori</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {(tipe === "worker" ? categoriesForRole("worker") : JOB_CATEGORIES).map((c) => {
            const copy = categoryPostCopy(c, tipe === "worker" ? "jasa" : "kerja");
            return (
              <Link
                key={c}
                href={`/kategori?tipe=${tipe === "worker" ? "jasa" : "kerja"}&kategori=${encodeURIComponent(c)}`}
                className="card p-4 hover:-translate-y-0.5 hover:shadow-soft transition-all duration-200"
              >
                <span className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide line-clamp-1">
                  {copy.title}
                </span>
                <p className="text-sm text-ink/60 mt-1 leading-snug line-clamp-2">{copy.subtitle}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <NearbyJobsSection />

      {remoteWorkerJobs.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Wifi size={16} className="text-turquoise" />
            <h2 className="font-display text-lg font-semibold">
              Saya Butuh Pekerjaan (Penerima Upah) &mdash; Khusus Remote
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {remoteWorkerJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      <BottomNav />
      <LocationPrompt />
    </div>
  );
}
