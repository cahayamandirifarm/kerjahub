import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AcceptButton from "./AcceptButton";

export default async function ApplicantsPage({ params }: { params: { jobId: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.jobId).single();
  const { data: applications } = await supabase
    .from("applications")
    .select("*, profiles!applications_worker_id_fkey(full_name, avatar_url, skills, kyc_status)")
    .eq("job_id", params.jobId)
    .order("created_at", { ascending: false });

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, worker_id")
    .eq("job_id", params.jobId);

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Pelamar</h1>
      <p className="text-sm text-ink/60 mb-6">{job?.title}</p>

      <div className="space-y-3">
        {(!applications || applications.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Belum ada pelamar.</div>
        )}
        {applications?.map((app: any) => (
          <div key={app.id} className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-turquoise-light flex items-center justify-center font-display font-semibold text-turquoise-dark shrink-0">
                {app.profiles?.full_name?.[0] ?? "?"}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{app.profiles?.full_name}</p>
                {app.profiles?.kyc_status === "terverifikasi" && (
                  <p className="text-xs text-turquoise">Identitas terverifikasi</p>
                )}
              </div>
            </div>
            {app.message && <p className="text-sm text-ink/70 mt-3">{app.message}</p>}
            {app.profiles?.skills && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {app.profiles.skills.map((s: string) => (
                  <span key={s} className="text-xs bg-turquoise-light text-turquoise-dark rounded-full px-2 py-1">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-ink/40">{app.status}</span>
              {app.status === "menunggu" && job?.stage === "terbuka" && (
                <AcceptButton applicationId={app.id} />
              )}
              {app.status === "diterima" && (
                <div className="flex gap-3">
                  <Link href={`/dashboard/job/${params.jobId}`} className="text-sm font-semibold text-turquoise">
                    Progres
                  </Link>
                  <Link
                    href={`/chat/${conversations?.find((c) => c.worker_id === app.worker_id)?.id ?? ""}`}
                    className="text-sm font-semibold text-turquoise"
                  >
                    Buka Chat
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
