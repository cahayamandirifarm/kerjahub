import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusStepper";
import { Wallet, ArrowDownToLine, Landmark, History, Briefcase } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Dasbor Pencari Kerja</h1>
        <Link href="/dashboard/employer" className="text-sm font-semibold text-forest">
          Lihat sisi Pemberi Kerja &rarr;
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
          <Link href="/dashboard/worker/withdraw" className="btn-gold !px-4 !py-2 text-sm gap-1">
            <ArrowDownToLine size={16} /> Tarik Saldo
          </Link>
          <Link
            href="/dashboard/worker/bank"
            className="bg-white/10 text-white border border-white/30 rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-1"
          >
            <Landmark size={16} /> Rekening Bank
          </Link>
        </div>
      </div>

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

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Lamaran Saya</h2>
        <Link href="/dashboard/worker/history" className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
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
                <span className="text-xs font-semibold text-forest uppercase">{app.jobs?.category}</span>
                <h3 className="font-semibold text-ink truncate">{app.jobs?.title}</h3>
                <p className="text-sm text-ink/50 mt-0.5">{formatRupiah(app.jobs?.price)}</p>
              </div>
              <StatusBadge stage={app.jobs?.stage} />
            </div>
            <p className="text-xs text-ink/40 mt-2 inline-flex items-center gap-1">
              <Briefcase size={12} /> Status lamaran: {app.status}
            </p>
            {app.status === "diterima" && (
              <Link href={`/dashboard/job/${app.job_id}`} className="inline-block mt-2 text-sm font-semibold text-forest">
                Lihat progres pekerjaan &rarr;
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
