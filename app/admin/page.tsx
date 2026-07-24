"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

interface Counts {
  totalUsers: number;
  totalJobs: number;
  pendingKyc: number;
  pendingWithdraw: number;
  totalKomisi: number;
}

export default function AdminOverviewPage() {
  const supabase = createClient();
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    const [{ count: totalUsers }, { count: totalJobs }, { count: pendingKyc }, { count: pendingWithdraw }, { data: komisi }] =
      await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        // Postingan kerja aktif saja -- jangan ikut hitung yang sudah
        // dihapus (removed_by_poster) atau dinonaktifkan (is_active = false),
        // supaya angkanya mencerminkan postingan yang benar-benar masih tayang.
        supabase
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("removed_by_poster", false),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("kyc_status", "menunggu"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "penarikan").eq("status", "menunggu"),
        supabase.from("transactions").select("amount").eq("type", "komisi_platform").eq("status", "berhasil")
      ]);

    const totalKomisi = (komisi || []).reduce((sum, t) => sum + Number(t.amount), 0);

    setCounts({
      totalUsers: totalUsers ?? 0,
      totalJobs: totalJobs ?? 0,
      pendingKyc: pendingKyc ?? 0,
      pendingWithdraw: pendingWithdraw ?? 0,
      totalKomisi
    });
  }, [supabase]);

  useEffect(() => {
    load();

    // Live update: begitu ada perubahan di tabel-tabel terkait (postingan
    // baru/dihapus/dinonaktifkan, KYC diajukan, penarikan, komisi masuk),
    // angka ringkasan langsung dihitung ulang tanpa perlu refresh halaman.
    const channel = supabase
      .channel("admin-overview-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    { label: "Total Pengguna", value: counts?.totalUsers ?? 0 },
    { label: "Total Postingan Kerja", value: counts?.totalJobs ?? 0 },
    { label: "KYC Menunggu Review", value: counts?.pendingKyc ?? 0 },
    { label: "Penarikan Menunggu", value: counts?.pendingWithdraw ?? 0 },
    { label: "Total Komisi Platform", value: formatRupiah(counts?.totalKomisi ?? 0) }
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Ringkasan</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-sm text-ink/50">{c.label}</p>
            <p className="font-display text-2xl font-semibold mt-1">
              {counts === null ? <span className="text-ink/30">...</span> : c.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
