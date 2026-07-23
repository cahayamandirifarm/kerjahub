import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusStepper";
import JobStatusButtons from "./JobStatusButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminJobsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const q = searchParams?.q?.trim() || "";

  let employerIds: string[] = [];
  if (q) {
    const { data: matchedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
    employerIds = matchedProfiles?.map((p) => p.id) || [];
  }

  let query = supabase
    .from("jobs")
    .select("*, profiles!jobs_employer_id_fkey(full_name)")
    .neq("stage", "selesai")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) {
    query = query.in("employer_id", employerIds.length ? employerIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  const { data: jobs } = await query;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-4">Postingan Kerja</h1>
      <form method="GET" className="mb-4 flex gap-2 max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Cari nama atau username pemasang..."
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0 !px-4">
          Cari
        </button>
        {q && (
          <a href="/admin/jobs" className="btn-secondary shrink-0 !px-4 flex items-center">
            Reset
          </a>
        )}
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Judul</th>
              <th className="text-left px-4 py-3">Pemasang</th>
              <th className="text-left px-4 py-3">Jenis Postingan</th>
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
                <td className="px-4 py-3">
                  {j.posted_by_role === "worker" ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gold/15 text-gold-dark text-xs font-semibold whitespace-nowrap">
                      Penerima Upah
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-turquoise/15 text-turquoise-dark text-xs font-semibold whitespace-nowrap">
                      Pemberi Upah
                    </span>
                  )}
                </td>
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
        {jobs?.length === 0 && (
          <div className="p-6 text-center text-ink/50 text-sm">
            {q ? `Tidak ada postingan dari pengguna "${q}".` : "Belum ada postingan kerja."}
          </div>
        )}
      </div>
    </div>
  );
}
