import Link from "next/link";
import { ChevronRight, MapPin, Tag, Star, ArrowRight } from "lucide-react";
import type { SeoFaq, SeoLandingPage } from "@/lib/seo-types";

type Related = Pick<SeoLandingPage, "id" | "title" | "slug" | "h1">;
type RelatedJob = {
  id: string;
  title: string;
  price: number;
  location: string;
  is_remote: boolean;
  profiles?: { full_name: string; rating_avg: number; rating_count: number } | null;
};
type RelatedCategory = { id: string; name: string; slug: string };
type SiblingCity = { slug: string; h1: string; location?: { name: string } | null };

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

// Presentasi murni, dipakai di 2 tempat:
//   1. app/[slug]/page.tsx        -- halaman publik yang sudah terbit
//   2. app/admin/seo/landing-pages/[id]/preview/page.tsx -- preview admin
//      (bisa lihat draft SEBELUM publish, sesuai fitur "Preview" di spec)
export default function LandingPageView({
  lp,
  faqs,
  related,
  relatedJobs = [],
  relatedCategories = [],
  siblingCities = [],
  previewBanner
}: {
  lp: SeoLandingPage & { category?: { name: string } | null; location?: { name: string } | null };
  faqs: SeoFaq[];
  related: Related[];
  relatedJobs?: RelatedJob[];
  relatedCategories?: RelatedCategory[];
  siblingCities?: SiblingCity[];
  previewBanner?: boolean;
}) {
  // Rating agregat asli (BUKAN testimoni karangan) dari penyedia jasa yang
  // posting-nya cocok dengan layanan ini -- dipakai sebagai sinyal
  // kepercayaan pengganti "Review/Testimonial" tanpa mengarang kutipan.
  const ratedJobs = relatedJobs.filter((j) => j.profiles && j.profiles.rating_count > 0);
  const avgRating = ratedJobs.length
    ? ratedJobs.reduce((sum, j) => sum + (j.profiles?.rating_avg || 0), 0) / ratedJobs.length
    : null;
  const totalReviews = ratedJobs.reduce((sum, j) => sum + (j.profiles?.rating_count || 0), 0);

  return (
    <div className="min-h-screen bg-paper">
      {previewBanner && (
        <div className="bg-gold text-ink text-center text-xs font-semibold py-2 sticky top-0 z-10">
          Mode Preview — halaman ini {lp.status === "published" ? "sudah" : "BELUM"} tayang untuk publik
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 py-10">
        <nav className="flex items-center gap-1.5 text-xs text-ink/40 mb-5">
          <Link href="/" className="hover:text-turquoise-dark">
            Beranda
          </Link>
          <ChevronRight size={12} />
          <span className="text-ink/70">{lp.h1}</span>
        </nav>

        {(lp.category || lp.location) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {lp.category && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-turquoise-dark bg-turquoise-light px-2.5 py-1 rounded-full">
                <Tag size={11} /> {lp.category.name}
              </span>
            )}
            {lp.location && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink/60 bg-ink/5 px-2.5 py-1 rounded-full">
                <MapPin size={11} /> {lp.location.name}
              </span>
            )}
          </div>
        )}

        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink leading-tight">{lp.h1}</h1>
        {lp.hero_title && <p className="text-lg font-semibold text-turquoise-dark mt-2">{lp.hero_title}</p>}
        {lp.hero_description && <p className="text-ink/60 mt-2">{lp.hero_description}</p>}

        {avgRating !== null && (
          <div className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-ink/70 bg-white border border-line rounded-full px-3 py-1.5">
            <Star size={14} className="text-gold fill-gold" />
            {avgRating.toFixed(1)} rata-rata rating penyedia jasa · {totalReviews} ulasan
          </div>
        )}

        {lp.cta_text && lp.cta_link && (
          <Link href={lp.cta_link} className="btn-primary inline-flex mt-5">
            {lp.cta_text}
          </Link>
        )}

        {lp.content && (
          <div
            className="prose prose-sm sm:prose-base max-w-none mt-8 prose-headings:font-display prose-headings:text-ink prose-a:text-turquoise-dark"
            dangerouslySetInnerHTML={{ __html: lp.content }}
          />
        )}

        {relatedJobs.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Postingan Jasa Terkait di KerjaHub</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {relatedJobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="card p-4 hover:border-turquoise/40">
                  <p className="font-semibold text-sm text-ink line-clamp-2">{job.title}</p>
                  <p className="text-xs text-ink/40 mt-1">{job.is_remote ? "Remote" : job.location}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-gold-dark">{formatRupiah(job.price)}</span>
                    {job.profiles && job.profiles.rating_count > 0 && (
                      <span className="text-xs text-ink/50 inline-flex items-center gap-1">
                        <Star size={11} className="text-gold fill-gold" /> {job.profiles.rating_avg.toFixed(1)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {faqs.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Pertanyaan yang Sering Diajukan</h2>
            <div className="space-y-2">
              {faqs.map((f) => (
                <details key={f.id} className="card p-4 group">
                  <summary className="font-semibold text-sm text-ink cursor-pointer list-none flex items-center justify-between">
                    {f.question}
                    <ChevronRight size={16} className="text-ink/30 group-open:rotate-90 transition-transform shrink-0 ml-2" />
                  </summary>
                  <p className="text-sm text-ink/60 mt-2">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        )}

        {relatedCategories.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Lihat Juga</h2>
            <div className="flex flex-wrap gap-2">
              {relatedCategories.map((c) => (
                <Link
                  key={c.id}
                  href={`/${c.slug}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise-dark bg-turquoise-light px-3 py-1.5 rounded-full hover:bg-turquoise/20"
                >
                  {c.name} <ArrowRight size={13} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {siblingCities.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Kota Lain</h2>
            <div className="flex flex-wrap gap-2">
              {siblingCities.map((c) => (
                <Link key={c.slug} href={`/${c.slug}`} className="text-sm font-semibold text-ink/60 bg-ink/5 px-3 py-1.5 rounded-full hover:bg-ink/10">
                  {c.location?.name || c.h1}
                </Link>
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink mb-3">Layanan Terkait</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <Link key={r.id} href={`/${r.slug}`} className="card p-4 hover:border-turquoise/40">
                  <p className="font-semibold text-sm text-ink">{r.h1 || r.title}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
