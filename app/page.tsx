import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import JobCard from "@/components/JobCard";
import NearbyJobsSection from "@/components/NearbyJobsSection";
import LocationPrompt from "@/components/LocationPrompt";
import SiteBanner from "@/components/SiteBanner";
import BannerCarousel from "@/components/BannerCarousel";
import { Job, JOB_CATEGORIES } from "@/lib/types";
import { Search } from "lucide-react";

export const revalidate = 0;

export default async function HomePage({
  searchParams
}: {
  searchParams: { kategori?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("stage", "terbuka")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (searchParams.kategori) {
    query = query.eq("category", searchParams.kategori);
  }

  const { data: jobs } = await query;

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Navbar />
      <SiteBanner />
      <BannerCarousel />

      <section className="max-w-5xl mx-auto px-4 pt-10 pb-8">
        <span className="badge-stage stage-dibayar mb-4">Dompet aman, kerja tenang</span>
        <h1 className="font-display text-4xl md:text-5xl font-semibold leading-[1.1] text-ink max-w-xl">
          Semua pekerjaan, satu tempat mempertemukan.
        </h1>
        <p className="mt-4 text-ink/60 max-w-lg text-base">
          Dari tukang kebun sampai desainer lepas — cari pekerja terpercaya atau
          tawarkan keahlianmu. Pembayaran ditahan platform sampai pekerjaan selesai.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/login" className="btn-primary">Pasang penawaran kerja</a>
          <a href="#daftar-kerja" className="btn-secondary">Lihat lowongan</a>
        </div>
      </section>

      <NearbyJobsSection />

      <section id="daftar-kerja" className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4">
          <a
            href="/"
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border ${
              !searchParams.kategori
                ? "bg-forest text-paper border-forest"
                : "bg-white text-ink/70 border-line"
            }`}
          >
            Semua
          </a>
          {JOB_CATEGORIES.map((c) => (
            <a
              key={c}
              href={`/?kategori=${encodeURIComponent(c)}`}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border ${
                searchParams.kategori === c
                  ? "bg-forest text-paper border-forest"
                  : "bg-white text-ink/70 border-line"
              }`}
            >
              {c}
            </a>
          ))}
        </div>

        {(!jobs || jobs.length === 0) && (
          <div className="card p-8 text-center text-ink/50">
            <Search className="mx-auto mb-3" />
            Belum ada penawaran kerja untuk kategori ini.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {(jobs as Job[] | null)?.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </section>

      <BottomNav />
      <LocationPrompt />
    </div>
  );
}
