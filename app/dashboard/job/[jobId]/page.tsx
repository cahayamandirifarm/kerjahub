import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import StatusBadge from "@/components/StatusStepper";
import WorkerActions from "./WorkerActions";
import EmployerActions from "./EmployerActions";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function JobProgressPage({ params }: { params: { jobId: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/job/${params.jobId}`);

  // CATATAN: "employer" di sini berarti PIHAK YANG BAYAR & BERHAK APPROVE
  // (jobs.client_id) -- BUKAN selalu jobs.employer_id. Untuk lowongan kerja
  // biasa keduanya sama (client_id = employer_id). Untuk postingan
  // mencari kerja, jobs.employer_id justru pekerja yang mengerjakan (poster),
  // sedangkan client_id adalah pelamar yang membayar & mengonfirmasi
  // pekerjaan selesai -- jadi WAJIB pakai client_id di sini, bukan employer_id,
  // supaya form konfirmasi tampil ke orang yang benar-benar berhak.
  const { data: job } = await supabase
    .from("jobs")
    .select("*, employer:profiles!jobs_client_id_fkey(full_name, phone), worker:profiles!jobs_assigned_worker_id_fkey(full_name, phone)")
    .eq("id", params.jobId)
    .single();

  if (!job) notFound();

  const isEmployer = job.client_id === user.id;
  const isWorker = job.assigned_worker_id === user.id;
  if (!isEmployer && !isWorker) redirect("/dashboard/employer");

  const { data: photos } = await supabase
    .from("job_photos")
    .select("*")
    .eq("job_id", params.jobId)
    .order("created_at", { ascending: true });

  const { data: rating } = await supabase.from("ratings").select("*").eq("job_id", params.jobId).maybeSingle();

  const employer = (job as any).employer;
  const worker = (job as any).worker;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-display text-2xl font-semibold">{job.title}</h1>
        <StatusBadge stage={job.stage} />
      </div>
      <p className="text-sm text-ink/60 mb-6">{formatRupiah(job.price)}</p>

      <div className="card p-4 mb-4 text-sm text-ink/70">
        <p>
          <span className="font-semibold text-ink">Pemberi kerja:</span> {employer?.full_name}
        </p>
        {worker && (
          <p className="mt-1">
            <span className="font-semibold text-ink">Pekerja:</span> {worker.full_name}
          </p>
        )}
      </div>

      {photos && photos.length > 0 && (
        <div className="card p-4 mb-4">
          <h2 className="font-display text-base font-semibold mb-3">Foto Hasil Pekerjaan</h2>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank">
                <img src={p.url} alt="" className="w-full aspect-square object-cover rounded-lg border border-line" />
              </a>
            ))}
          </div>
        </div>
      )}

      {rating && (
        <div className="card p-4 mb-4">
          <h2 className="font-display text-base font-semibold mb-2">Rating & Ulasan</h2>
          <p className="text-gold-dark font-semibold">{"★".repeat(rating.rating)}{"☆".repeat(5 - rating.rating)}</p>
          {rating.review && <p className="text-sm text-ink/70 mt-1">{rating.review}</p>}
        </div>
      )}

      {isWorker && (
        <WorkerActions
          jobId={job.id}
          stage={job.stage}
          employerPhone={employer?.phone}
          employerName={employer?.full_name}
          jobTitle={job.title}
          photoCount={photos?.length ?? 0}
        />
      )}

      {isEmployer && <EmployerActions jobId={job.id} stage={job.stage} hasPhotos={(photos?.length ?? 0) > 0} />}
    </div>
  );
}
