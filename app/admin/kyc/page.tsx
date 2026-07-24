import { createClient } from "@/lib/supabase/server";
import { AdminKycReviewButtons } from "@/components/AdminReviewButtons";
import Pagination from "@/components/Pagination";

// 10 pengajuan per halaman supaya query & payload halaman admin lebih
// ringan (dulu ambil semua data sekaligus tanpa batas).
const PAGE_SIZE = 10;

export default async function AdminKycPage({ searchParams }: { searchParams: { page?: string } }) {
  const supabase = createClient();

  const pageParam = Number(searchParams?.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE; // ambil 1 ekstra untuk cek ada halaman berikutnya

  const { data: rows } = await supabase
    .from("profiles")
    .select("*")
    .eq("kyc_status", "menunggu")
    .order("created_at", { ascending: true })
    .range(from, to);

  const hasNext = (rows?.length || 0) > PAGE_SIZE;
  const pending = (rows || []).slice(0, PAGE_SIZE);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Verifikasi KYC</h1>
      <div className="space-y-3">
        {(!pending || pending.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada pengajuan KYC yang menunggu.</div>
        )}
        {pending?.map((p) => (
          <div key={p.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              {p.kyc_selfie_url && (
                <img src={p.kyc_selfie_url} alt="" className="w-14 h-14 rounded-full object-cover border border-line" />
              )}
              {p.kyc_ktp_url && (
                <img src={p.kyc_ktp_url} alt="" className="w-20 h-14 rounded-lg object-cover border border-line" />
              )}
              <div>
                <p className="font-semibold">{p.full_name}</p>
                <p className="text-sm text-ink/50">{p.phone}</p>
                <p className="text-[11px] text-ink/40 mb-0.5">Pastikan nama di atas sama dengan nama pada KTP/SIM sebelum menyetujui.</p>
                <div className="flex gap-3">
                  {p.kyc_selfie_url && (
                    <a href={p.kyc_selfie_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                      Lihat selfie
                    </a>
                  )}
                  {p.kyc_ktp_url && (
                    <a href={p.kyc_ktp_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                      Lihat KTP/SIM
                    </a>
                  )}
                </div>
              </div>
            </div>
            <AdminKycReviewButtons profileId={p.id} />
          </div>
        ))}
      </div>
      <Pagination basePath="/admin/kyc" params={{}} currentPage={page} hasNext={hasNext} />
    </div>
  );
}
