import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusStepper";
import { Wallet, Plus, ArrowDownToLine, Users } from "lucide-react";
import TopUpButton from "@/components/TopUpButton";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function EmployerDashboard() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/employer");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, applications(count)")
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Dasbor Pemberi Kerja</h1>
        <Link href="/dashboard/worker" className="text-sm font-semibold text-forest">
          Lihat sisi Pencari Kerja &rarr;
        </Link>
      </div>

      <div className="card p-5 bg-[#0f172a] text-white">
        <div className="flex items-center gap-2 text-white/70 text-sm">
          <Wallet size={16} /> Saldo Dompet
        </div>
        <p className="font-display font-bold mt-1 tracking-tight text-white" style={{ fontSize: 32 }}>
          {formatRupiah(profile?.wallet_balance)}
        </p>
        <div className="flex gap-3 mt-4">
          <TopUpButton />
          <Link
            href="/dashboard/employer/withdraw?tab=tarik"
            className="bg-white/10 text-white border border-white/30 rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
          >
            <ArrowDownToLine size={16} /> Tarik Saldo
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

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Penawaran Kerja Saya</h2>
        <Link href="/dashboard/employer/post-job" className="btn-primary !px-4 !py-2 text-sm gap-1">
          <Plus size={16} /> Pasang Penawaran
        </Link>
      </div>

      <Link href="/dashboard/employer/nearby-workers" className="text-sm font-semibold text-forest inline-flex items-center gap-1">
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
                <span className="text-xs font-semibold text-forest uppercase">{job.category}</span>
                <h3 className="font-semibold text-ink truncate">{job.title}</h3>
                <p className="text-sm text-ink/50 mt-0.5">{formatRupiah(job.price)}</p>
              </div>
              <StatusBadge stage={job.stage} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-sm text-ink/60">
                <Users size={14} /> {job.applications?.[0]?.count ?? 0} pelamar
              </span>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/employer/applicants/${job.id}`}
                  className="text-sm font-semibold text-forest"
                >
                  Kelola pelamar
                </Link>
                {job.stage !== "terbuka" && (
                  <Link href={`/dashboard/job/${job.id}`} className="text-sm font-semibold text-forest">
                    Lihat progres
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
