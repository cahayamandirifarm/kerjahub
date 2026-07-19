import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusStepper";
import JobStatusButtons from "./JobStatusButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminJobsPage() {
  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, profiles!jobs_employer_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Postingan Kerja</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Judul</th>
              <th className="text-left px-4 py-3">Pemasang</th>
              <th className="text-left px-4 py-3">Kategori</th>
              <th className="text-left px-4 py-3">Harga</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Aktif</th>
              <th className="text-left px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((j: any) => (
              <tr key={j.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{j.title}</td>
                <td className="px-4 py-3">{j.profiles?.full_name}</td>
                <td className="px-4 py-3">{j.category}</td>
                <td className="px-4 py-3">{formatRupiah(j.price)}</td>
                <td className="px-4 py-3">
                  <StatusBadge stage={j.stage} />
                </td>
                <td className="px-4 py-3">
                  {j.is_active ? (
                    <span className="text-turquoise font-semibold text-xs">Aktif</span>
                  ) : (
                    <span className="text-clay font-semibold text-xs">Nonaktif</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <JobStatusButtons jobId={j.id} isActive={j.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
