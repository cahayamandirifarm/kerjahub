import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusStepper";
import { Wallet, Plus, ArrowDownToLine, Users, Store, Landmark, History, Share2 } from "lucide-react";
import TopUpButton from "@/components/TopUpButton";
import JobPostingActions from "@/components/JobPostingActions";
import ListingPostingActions from "@/components/ListingPostingActions";
import { DIGITAL_CATEGORIES } from "@/lib/types";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

// Postingan job dengan is_nego = true belum punya harga final -- price
// yang tersimpan cuma perkiraan awal, jadi jangan ditampilkan sebagai
// harga di dasbor supaya tidak dikira harga pasti. Cukup tampilkan "NEGO".
function formatJobPrice(job: { price: number; is_nego?: boolean }) {
  return job.is_nego ? "NEGO" : formatRupiah(job.price);
}

const LISTING_STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  nonaktif: "Nonaktif",
  terjual: "Terjual",
  dihapus: "Dihapus"
};

export default async function EmployerDashboard() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/employer");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  // Semua postingan milik user ini digabung di satu dasbor: penawaran kerja
  // (posted_by_role employer), tawaran mencari kerja (posted_by_role worker),
  // dan produk marketplace digital (digital_listings) -- masing-masing bisa
  // langsung diedit atau dihapus permanen dari sini.
  const [{ data: jobs }, { data: workerListings }, { data: digitalListings }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, applications(count)")
      .eq("employer_id", user.id)
      .eq("posted_by_role", "employer")
      .eq("removed_by_poster", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("*, applications(count)")
      .eq("employer_id", user.id)
      .eq("posted_by_role", "worker")
      .eq("removed_by_poster", false)
      .order("created_at", { ascending: false }),
    supabase.from("digital_listings").select("*").eq("seller_id", user.id).order("created_at", { ascending: false })
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Dasbor Saya</h1>
        <Link href="/dashboard/worker" className="text-sm font-semibold text-turquoise">
          Lamaran &amp; riwayat saya &rarr;
        </Link>
      </div>

      <div className="card p-5" style={{ backgroundColor: "#0f172a" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          <Wallet size={16} /> Saldo Dompet
        </div>
        <p className="font-display font-bold mt-1 tracking-tight" style={{ fontSize: 32, color: "#ffffff" }}>
          {formatRupiah(profile?.wallet_balance)}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <TopUpButton className="btn-primary !px-4 !py-2 !text-sm !shadow-none gap-1" />
          <Link
            href="/dashboard/employer/withdraw?tab=tarik"
            className="rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            <ArrowDownToLine size={16} /> Tarik Saldo
          </Link>
          <Link
            href="/dashboard/employer/bank"
            className="rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            <Landmark size={16} /> Rekening Bank
          </Link>
          <Link
            href="/dashboard/riwayat"
            className="rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            <History size={16} /> Riwayat Transaksi
          </Link>
          <Link
            href="/dashboard/referral"
            className="rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            <Share2 size={16} /> Kode Referral
          </Link>
        </div>
      </div>

      {profile?.kyc_status !== "terverifikasi" && (
        <div className="card p-4 border-gold/40 bg-gold-light flex items-center justify-between gap-3">
          <p className="text-sm text-ink/70">
            Verifikasi identitas (KYC) dulu untuk mulai memasang penawaran kerja.
          </p>
          <Link href="/kyc" className="btn-secondary !px-3 !py-1.5 text-sm shrink-0">
            Verifikasi
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1) Penawaran Kerja Saya (posted_by_role = employer)            */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Penawaran Kerja Saya</h2>
        <Link href="/dashboard/employer/post-job" className="btn-primary !px-4 !py-2 text-sm gap-1">
          <Plus size={16} /> Pasang Penawaran
        </Link>
      </div>

      <Link href="/dashboard/employer/nearby-workers" className="text-sm font-semibold text-turquoise inline-flex items-center gap-1">
        <Users size={14} /> Lihat pekerja terdekat
      </Link>

      <div className="space-y-3">
        {(!jobs || jobs.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">
            Belum ada penawaran kerja. Yuk pasang yang pertama.
          </div>
        )}
        {jobs?.map((job: any) => (
          <div key={job.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-turquoise uppercase">{job.category}</span>
                <h3 className="font-semibold text-ink truncate">{job.title}</h3>
                <p className="text-sm text-ink/50 mt-0.5">{formatJobPrice(job)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge stage={job.stage} />
                {!job.is_active && <span className="text-[11px] font-semibold text-ink/40">Nonaktif</span>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 text-sm text-ink/60">
                <Users size={14} /> {job.applications?.[0]?.count ?? 0} pelamar
              </span>
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/employer/applicants/${job.id}`} className="text-sm font-semibold text-turquoise">
                  Kelola pelamar
                </Link>
                {job.stage !== "terbuka" && (
                  <Link href={`/dashboard/job/${job.id}`} className="text-sm font-semibold text-turquoise">
                    Lihat progres
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line/60">
              <JobPostingActions jobId={job.id} title={job.title} isActive={job.is_active} stage={job.stage} editable={job.stage === "terbuka"} />
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2) Mencari Kerja Saya (posted_by_role = worker)                 */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Mencari Kerja Saya</h2>
        <Link href="/dashboard/worker/post-listing" className="btn-secondary !px-4 !py-2 text-sm gap-1">
          <Plus size={16} /> Saya Butuh Pekerjaan
        </Link>
      </div>

      <div className="space-y-3">
        {(!workerListings || workerListings.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">
            Belum ada tawaran mencari kerja. Yuk tawarkan keahlianmu.
          </div>
        )}
        {workerListings?.map((job: any) => (
          <div key={job.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-turquoise uppercase">{job.category}</span>
                <h3 className="font-semibold text-ink truncate">{job.title}</h3>
                <p className="text-sm text-ink/50 mt-0.5">{formatJobPrice(job)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge stage={job.stage} />
                {!job.is_active && <span className="text-[11px] font-semibold text-ink/40">Nonaktif</span>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-ink/60">{job.applications?.[0]?.count ?? 0} yang tertarik</span>
              <Link href={`/dashboard/employer/applicants/${job.id}`} className="text-sm font-semibold text-turquoise">
                Kelola
              </Link>
            </div>
            <div className="mt-3 pt-3 border-t border-line/60">
              <JobPostingActions jobId={job.id} title={job.title} isActive={job.is_active} stage={job.stage} editable={job.stage === "terbuka"} />
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3) Produk Marketplace Digital Saya                              */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Produk Marketplace Digital Saya</h2>
        <Link href="/marketplace/post" className="btn-secondary !px-4 !py-2 text-sm gap-1">
          <Plus size={16} /> Jual Produk
        </Link>
      </div>

      <div className="space-y-3">
        {(!digitalListings || digitalListings.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">
            Belum ada produk digital yang kamu jual.
          </div>
        )}
        {digitalListings?.map((listing: any) => (
          <div key={listing.id} className="card p-4">
            <div className="flex items-start gap-3">
              {listing.cover_image && (
                <img src={listing.cover_image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-turquoise uppercase">
                      <Store size={12} /> {DIGITAL_CATEGORIES.find((c) => c.value === listing.category)?.label ?? listing.category}
                    </span>
                    <h3 className="font-semibold text-ink truncate">{listing.title}</h3>
                    <p className="text-sm text-ink/50 mt-0.5">{formatRupiah(listing.price)}</p>
                  </div>
                  <span className="badge-stage stage-terbuka shrink-0">{LISTING_STATUS_LABEL[listing.status] ?? listing.status}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line/60">
              <ListingPostingActions listingId={listing.id} title={listing.title} status={listing.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
