import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusStepper";
import { Wallet, ArrowDownToLine, Landmark, History, Briefcase, Plus } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function WorkerDashboard() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/worker");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jobs(*)")
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: myListings } = await supabase
    .from("jobs")
    .select("*, applications(count)")
    .eq("employer_id", user.id)
    .eq("posted_by_role", "worker")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Dasbor Pencari Kerja</h1>
        <Link href="/dashboard/employer" className="text-sm font-semibold text-turquoise">
          Lihat sisi Pemberi Kerja &rarr;
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
          <Link
            href="/dashboard/worker/withdraw"
            className="btn-gold !px-4 !py-2 text-sm gap-1"
            style={{ color: "#1C2321" }}
          >
            <ArrowDownToLine size={16} /> Tarik Saldo
          </Link>
          <Link
            href="/dashboard/worker/bank"
            className="rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            <Landmark size={16} /> Rekening Bank
          </Link>
        </div>
      </div>

      <Link href="/dashboard/worker/post-listing" className="card p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition">
        <div>
          <p className="font-semibold text-ink">Pasang Mencari Kerja</p>
          <p className="text-sm text-ink/50">Tawarkan keahlianmu supaya ditemukan pemberi kerja di sekitarmu.</p>
        </div>
        <span className="btn-primary !px-3 !py-2 text-sm shrink-0 gap-1">
          <Plus size={16} /> Pasang
        </span>
      </Link>

      {profile?.kyc_status !== "terverifikasi" && (
        <div className="card p-4 border-gold/40 bg-gold-light flex items-center justify-between gap-3">
          <p className="text-sm text-ink/70">
            Verifikasi identitas (KYC) dulu supaya lamaranmu dipercaya pemberi kerja.
          </p>
          <Link href="/kyc" className="btn-secondary !px-3 !py-1.5 text-sm shrink-0">
            Verifikasi
          </Link>
        </div>
      )}

      {myListings && myListings.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Tawaran Jasa Saya</h2>
            <Link href="/dashboard/worker/post-listing" className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise">
              <Plus size={14} /> Pasang lagi
            </Link>
          </div>
          <div className="space-y-3">
            {myListings.map((job: any) => (
              <div key={job.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-turquoise uppercase">{job.category}</span>
                    <h3 className="font-semibold text-ink truncate">{job.title}</h3>
                    <p className="text-sm text-ink/50 mt-0.5">{formatRupiah(job.price)}</p>
                  </div>
                  <StatusBadge stage={job.stage} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-ink/60">{job.applications?.[0]?.count ?? 0} yang tertarik</span>
                  <Link href={`/dashboard/employer/applicants/${job.id}`} className="text-sm font-semibold text-turquoise">
                    Kelola
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Lamaran Saya</h2>
        <Link href="/dashboard/worker/history" className="inline-flex items-center gap-1 text-sm font-semibold text-turquoise">
          <History size={14} /> Riwayat lengkap
        </Link>
      </div>

      <div className="space-y-3">
        {(!applications || applications.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">
            Belum ada lamaran. Yuk cari pekerjaan di beranda.
          </div>
        )}
        {applications?.map((app: any) => (
          <div key={app.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-turquoise uppercase">{app.jobs?.category}</span>
                <h3 className="font-semibold text-ink truncate">{app.jobs?.title}</h3>
                <p className="text-sm text-ink/50 mt-0.5">{formatRupiah(app.jobs?.price)}</p>
              </div>
              <StatusBadge stage={app.jobs?.stage} />
            </div>
            <p className="text-xs text-ink/40 mt-2 inline-flex items-center gap-1">
              <Briefcase size={12} /> Status lamaran: {app.status}
            </p>
            {app.status === "diterima" && (
              <Link href={`/dashboard/job/${app.job_id}`} className="inline-block mt-2 text-sm font-semibold text-turquoise">
                Lihat progres pekerjaan &rarr;
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
