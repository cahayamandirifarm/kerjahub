import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import JobCard from "@/components/JobCard";
import NearbyJobsSection from "@/components/NearbyJobsSection";
import LocationPrompt from "@/components/LocationPrompt";
import SiteBanner from "@/components/SiteBanner";
import BannerCarousel from "@/components/BannerCarousel";
import { Job, JOB_CATEGORIES } from "@/lib/types";
import { Search } from "lucide-react";
import PostCTAButtons from "@/components/PostCTAButtons";
import ScrollToJobsButton from "@/components/ScrollToJobsButton";
import { categoryPostCopy } from "@/lib/category-copy";
import { getHomeJobs } from "@/lib/cached-queries";
import Pagination from "@/components/Pagination";
import GuestPageGate from "@/components/GuestPageGate";

// Berapa postingan yang ditampilkan per halaman -- sama untuk semua orang.
// Tamu (belum login) HANYA boleh membuka halaman 1 (lihat pengecekan
// isGuestBlocked di bawah); untuk lanjut ke halaman berikutnya wajib
// login/daftar dulu.
const PAGE_SIZE = 10;

// Daftar pekerjaan di beranda tidak lagi query Supabase langsung di setiap
// kunjungan -- diambil lewat getHomeJobs (Next.js Data Cache, cache 15
// menit). Halaman 1 tidak memanggil cookies() sama sekali, jadi
// Next.js/Vercel masih bisa menyajikannya dari cache (ISR) ke banyak
// pengunjung sekaligus. Cookies (lewat createClient di lib/supabase/server)
// HANYA dipanggil kalau ada yang minta halaman ke-2 dst, khusus untuk cek
// status login guest -- request itu jadi dynamic per-request, tapi
// halaman 1 (yang paling sering dikunjungi) tetap dapat manfaat ISR.
export const revalidate = 900;

export default async function HomePage({
  searchParams
}: {
  searchParams: { kategori?: string; tipe?: string; page?: string };
}) {
  const tipe = searchParams.tipe === "jasa" ? "worker" : "employer";
  // getHomeJobs sengaja throw kalau query ke Supabase gagal (supaya hasil
  // gagal itu tidak ikut ke-cache 30 menit sebagai "kosong" -- lihat
  // lib/cached-queries.ts). Di level halaman ini kita tangkap supaya
  // kegagalan sesaat menampilkan state "belum ada postingan" yang aman,
  // bukan meng-crash seluruh halaman beranda.
  const jobs = await getHomeJobs(tipe, searchParams.kategori).catch(() => null);

  const pageParam = Number(searchParams.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1;

  // Batasan tamu: halaman ke-2 dst dari feed publik ini wajib login.
  // Cek ini SENGAJA hanya dilakukan kalau page > 1, supaya halaman 1 (yang
  // paling banyak dikunjungi) tidak ikut memanggil cookies()/auth dan tetap
  // bisa di-ISR-cache seperti sebelumnya.
  let isGuestBlocked = false;
  if (page > 1) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) isGuestBlocked = true;
  }

  const allJobs = (jobs as Job[] | null) ?? [];
  const pageJobs = allJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasNext = allJobs.length > page * PAGE_SIZE;
  const nextPath = `/?tipe=${searchParams.tipe === "jasa" ? "jasa" : "kerja"}${
    searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""
  }&page=${page}`;

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

      <NearbyJobsSection />

      <section id="daftar-kerja" className="max-w-5xl mx-auto px-4 scroll-mt-24">
        <h2 className="section-title mb-4">Jelajahi Peluang</h2>
        <div className="flex items-center gap-2 mb-3">
          <Link
            href={`/?tipe=kerja${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            scroll={false}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "employer" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Saya Butuh Pekerja (Pemberi Upah)
          </Link>
          <Link
            href={`/?tipe=jasa${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            scroll={false}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "worker" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Saya Butuh Pekerjaan (Penerima Upah)
          </Link>
        </div>

        <h3 className="font-display text-sm font-semibold text-ink/70 mb-3">Semua Kategori</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {JOB_CATEGORIES.map((c) => {
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

        {isGuestBlocked ? (
          <GuestPageGate next={nextPath} />
        ) : (
          <>
            {pageJobs.length === 0 && (
              <div className="card p-8 text-center text-ink/50">
                <Search className="mx-auto mb-3" />
                {tipe === "worker" ? "Belum ada pekerja yang menawarkan jasa di kategori ini." : "Belum ada penawaran kerja untuk kategori ini."}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {pageJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            <Pagination
              basePath="/"
              params={{ tipe: searchParams.tipe, kategori: searchParams.kategori }}
              currentPage={page}
              hasNext={hasNext}
            />
          </>
        )}
      </section>

      <BottomNav />
      <LocationPrompt />
    </div>
  );
}
