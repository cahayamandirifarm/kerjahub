import { createClient } from "@/lib/supabase/server";
import { AdminKycReviewButtons } from "@/components/AdminReviewButtons";

export default async function AdminKycPage() {
  const supabase = createClient();
  const { data: pending } = await supabase
    .from("profiles")
    .select("*")
    .eq("kyc_status", "menunggu")
    .order("created_at", { ascending: true });

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
              <div>
                <p className="font-semibold">{p.full_name}</p>
                <p className="text-sm text-ink/50">{p.phone}</p>
                {p.kyc_selfie_url && (
                  <a href={p.kyc_selfie_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                    Lihat selfie ukuran penuh
                  </a>
                )}
              </div>
            </div>
            <AdminKycReviewButtons profileId={p.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
