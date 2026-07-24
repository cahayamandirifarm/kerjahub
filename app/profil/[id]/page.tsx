import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import JobCard from "@/components/JobCard";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Star, CheckCircle2, ShieldCheck, ShoppingBag, Briefcase, LogIn } from "lucide-react";
import { DIGITAL_CATEGORIES, DigitalListing, Job } from "@/lib/types";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

// Halaman profil publik butuh login (mengikuti kebijakan akses tabel
// `profiles` yang hanya bisa dibaca pengguna yang sudah masuk). Ini konsisten
// dengan bagian lain platform yang memang butuh akun untuk berinteraksi.
export default async function PublicProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen pb-24">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <LogIn className="mx-auto mb-3 text-ink/40" size={32} />
          <h1 className="font-display text-xl font-semibold text-ink mb-1">Masuk untuk melihat profil</h1>
          <p className="text-sm text-ink/55 mb-5">Login diperlukan untuk melihat profil, rating, dan seluruh postingan pengguna ini.</p>
          <Link href={`/login?redirect=/profil/${params.id}`} className="btn-primary inline-flex">
            Masuk / Daftar
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, bio, rating_avg, rating_count, completed_jobs_count, kyc_status, created_at")
    .eq("id", params.id)
    .single();

  if (!profile) notFound();

  const [{ data: jobs }, { data: listings }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*")
      .eq("employer_id", params.id)
      .eq("is_active", true)
      .in("stage", ["terbuka", "diterima", "dikerjakan", "dana_diamankan"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("digital_listings")
      .select("*")
      .eq("seller_id", params.id)
      .in("status", ["aktif", "terjual"])
      .order("created_at", { ascending: false })
      .limit(50)
  ]);

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="card p-6 flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-turquoise-light flex items-center justify-center font-display text-2xl font-semibold text-turquoise-dark shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full rounded-full object-cover" />
            ) : (
              profile.full_name?.[0] ?? "?"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold text-ink">{profile.full_name}</h1>
            {profile.kyc_status === "terverifikasi" && (
              <p className="text-xs text-turquoise inline-flex items-center gap-1 mt-0.5">
                <ShieldCheck size={13} /> Identitas terverifikasi
              </p>
            )}
            {profile.bio && <p className="text-sm text-ink/60 mt-2 leading-relaxed">{profile.bio}</p>}

            <div className="flex items-center gap-4 flex-wrap mt-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Star size={16} className="text-gold-dark fill-gold-dark" />
                {profile.rating_count > 0 ? profile.rating_avg.toFixed(1) : "Belum ada"}
                <span className="text-ink/45 font-normal">({profile.rating_count} ulasan)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <CheckCircle2 size={16} className="text-turquoise-dark" />
                {profile.completed_jobs_count}
                <span className="text-ink/45 font-normal">pekerjaan/pesanan selesai</span>
              </span>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="section-title mb-4 inline-flex items-center gap-2">
            <Briefcase size={18} /> Postingan Kerja &amp; Jasa
          </h2>
          {(!jobs || jobs.length === 0) && (
            <div className="card p-6 text-center text-ink/50 text-sm">Belum ada postingan kerja/jasa aktif.</div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {(jobs as Job[] | null)?.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="section-title mb-4 inline-flex items-center gap-2">
            <ShoppingBag size={18} /> Produk Marketplace
          </h2>
          {(!listings || listings.length === 0) && (
            <div className="card p-6 text-center text-ink/50 text-sm">Belum ada produk yang diposting.</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(listings as DigitalListing[] | null)?.map((item) => (
              <Link
                key={item.id}
                href={`/marketplace/${item.id}`}
                className="card group overflow-hidden block hover:-translate-y-1 hover:shadow-soft transition-all duration-200"
              >
                <div className="relative">
                  <img src={item.cover_image} alt={item.title} loading="lazy" decoding="async" className="w-full aspect-square object-cover" />
                  {item.status === "terjual" && (
                    <span className="badge-sold absolute top-2 left-2 bg-white/90">Terjual</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
                    {DIGITAL_CATEGORIES.find((c) => c.value === item.category)?.label}
                  </p>
                  <h3 className="font-semibold text-sm text-ink line-clamp-2 mt-0.5">{item.title}</h3>
                  <p className="font-display text-base font-bold text-ink mt-1.5">{formatRupiah(item.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
