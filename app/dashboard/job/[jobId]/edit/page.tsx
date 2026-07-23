import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import JobForm from "@/components/JobForm";

export default async function EditJobPage({ params }: { params: { jobId: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/job/${params.jobId}/edit`);

  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.jobId).single();
  if (!job) notFound();

  if (job.employer_id !== user.id) {
    redirect(job.posted_by_role === "worker" ? "/dashboard/worker" : "/dashboard/employer");
  }

  // Setelah ada pelamar yang diterima / pembayaran berjalan, detail seperti
  // harga tidak boleh diubah lagi karena sudah dipakai untuk hitung escrow.
  if (job.stage !== "terbuka") {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-6 text-center text-sm text-ink/60">
          Postingan ini sudah berjalan (status: {job.stage}) sehingga tidak bisa diedit lagi.
          Kamu masih bisa melihat progresnya dari dasbor.
        </div>
      </div>
    );
  }

  return (
    <JobForm
      role={job.posted_by_role}
      jobId={job.id}
      initial={{
        title: job.title,
        category: job.category,
        description: job.description,
        location: job.is_remote ? "" : job.location,
        is_remote: job.is_remote,
        price: job.price,
        is_nego: job.is_nego,
        estimated_duration: job.estimated_duration
      }}
    />
  );
}
