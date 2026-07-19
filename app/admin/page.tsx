import { createClient } from "@/lib/supabase/server";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminOverviewPage() {
  const supabase = createClient();

  const [{ count: totalUsers }, { count: totalJobs }, { count: pendingKyc }, { count: pendingWithdraw }, { data: komisi }] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("jobs").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "menunggu"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "penarikan").eq("status", "menunggu"),
      supabase.from("transactions").select("amount").eq("type", "komisi_platform").eq("status", "berhasil")
    ]);

  const totalKomisi = (komisi || []).reduce((sum, t) => sum + Number(t.amount), 0);

  const cards = [
    { label: "Total Pengguna", value: totalUsers ?? 0 },
    { label: "Total Postingan Kerja", value: totalJobs ?? 0 },
    { label: "KYC Menunggu Review", value: pendingKyc ?? 0 },
    { label: "Penarikan Menunggu", value: pendingWithdraw ?? 0 },
    { label: "Total Komisi Platform", value: formatRupiah(totalKomisi) }
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Ringkasan</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-sm text-ink/50">{c.label}</p>
            <p className="font-display text-2xl font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
