import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import JobCard from "@/components/JobCard";
import LocationPrompt from "@/components/LocationPrompt";
import SiteBanner from "@/components/SiteBanner";
import BannerCarousel from "@/components/BannerCarousel";
import { Job, JOB_CATEGORIES } from "@/lib/types";
import { Search } from "lucide-react";
import PostCTAButtons from "@/components/PostCTAButtons";

export const revalidate = 0;

export default async function HomePage({
  searchParams
}: {
  searchParams: { kategori?: string; tipe?: string };
}) {
  const supabase = createClient();
  const tipe = searchParams.tipe === "jasa" ? "worker" : "employer";

  let query = supabase
    .from("jobs")
    .select("*")
    .eq("stage", "terbuka")
    .eq("is_active", true)
    .eq("posted_by_role", tipe)
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
            <a href="#daftar-kerja" className="btn-primary">
              Temukan Lowongan &amp; Pekerja Sekitar
            </a>
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
          <a
            href={`/?tipe=kerja${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "employer" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Lowongan Kerja
          </a>
          <a
            href={`/?tipe=jasa${searchParams.kategori ? `&kategori=${encodeURIComponent(searchParams.kategori)}` : ""}`}
            className={`rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              tipe === "worker" ? "bg-brand text-white border-transparent shadow-soft" : "bg-white text-ink/70 border-line"
            }`}
          >
            Pekerja Menawarkan Jasa
          </a>
        </div>

        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4">
          <a
            href={`/?tipe=${tipe === "worker" ? "jasa" : "kerja"}`}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              !searchParams.kategori
                ? "bg-ink text-white border-transparent"
                : "bg-white text-ink/70 border-line"
            }`}
          >
            Semua
          </a>
          {JOB_CATEGORIES.map((c) => (
            <a
              key={c}
              href={`/?tipe=${tipe === "worker" ? "jasa" : "kerja"}&kategori=${encodeURIComponent(c)}`}
              className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
                searchParams.kategori === c
                  ? "bg-ink text-white border-transparent"
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
            {tipe === "worker" ? "Belum ada pekerja yang menawarkan jasa di kategori ini." : "Belum ada penawaran kerja untuk kategori ini."}
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
