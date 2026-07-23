import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusStepper";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

function formatJobPrice(job: { price: number; is_nego?: boolean } | null | undefined) {
  if (!job) return formatRupiah(0);
  return job.is_nego ? "NEGO" : formatRupiah(job.price);
}

export default async function WorkerHistoryPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/worker/history");

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jobs(*, profiles!jobs_employer_id_fkey(full_name, phone))")
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });

  const { data: earnings } = await supabase
    .from("transactions")
    .select("*")
    .eq("profile_id", user.id)
    .eq("type", "terima_upah")
    .order("created_at", { ascending: false });

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, job_id")
    .eq("worker_id", user.id);

  const totalEarnings = (earnings || []).reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Riwayat Pekerjaan</h1>
        <p className="text-sm text-ink/60">
          Total upah diterima: <span className="font-semibold text-turquoise">{formatRupiah(totalEarnings)}</span>
        </p>
      </div>

      <div className="space-y-3">
        {(!applications || applications.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Belum ada riwayat lamaran.</div>
        )}
        {applications?.map((app: any) => (
          <div key={app.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-ink truncate">{app.jobs?.title}</h3>
                <p className="text-sm text-ink/50">{formatJobPrice(app.jobs)}</p>
              </div>
              <StatusBadge stage={app.jobs?.stage} />
            </div>
            {app.status === "diterima" && (
              <Link href={`/dashboard/job/${app.job_id}`} className="inline-block mt-2 mr-4 text-sm font-semibold text-turquoise">
                Progres pekerjaan
              </Link>
            )}
            {app.status === "diterima" && (
              <Link
                href={`/chat/${conversations?.find((c) => c.job_id === app.job_id)?.id ?? ""}`}
                className="inline-block mt-2 text-sm font-semibold text-turquoise"
              >
                Buka Chat
              </Link>
            )}
            {app.status === "diterima" && app.jobs?.stage === "selesai" && app.jobs?.profiles && (
              <div className="mt-3 text-sm text-ink/60 border-t border-line pt-3">
                <p className="font-semibold text-ink/80 mb-1">Kontak pemberi kerja</p>
                <p>{app.jobs.profiles.full_name}</p>
                {app.jobs.profiles.phone && <p>{app.jobs.profiles.phone}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
