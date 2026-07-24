import { createClient } from "@/lib/supabase/server";
import { MapPin } from "lucide-react";

type CountRow = { label: string; count: number };

function aggregate(values: (string | null)[]): CountRow[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const label = raw?.trim();
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function BarChart({ rows, barClass }: { rows: CountRow[]; barClass: string }) {
  if (rows.length === 0) {
    return <div className="card p-6 text-center text-ink/50 text-sm">Belum ada data lokasi pengguna.</div>;
  }
  const max = rows[0].count;
  return (
    <div className="card p-5 space-y-3">
      {rows.map((row, i) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-xs text-ink/40 text-right">{i + 1}</span>
          <span className="w-32 sm:w-40 shrink-0 text-sm font-medium truncate">{row.label}</span>
          <div className="flex-1 h-5 rounded-full bg-paper overflow-hidden">
            <div
              className={`h-full rounded-full ${barClass}`}
              style={{ width: `${Math.max((row.count / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-sm font-semibold text-right">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminLokasiPenggunaPage() {
  const supabase = createClient();

  // city & district diisi otomatis lewat reverse-geocode titik GPS perangkat
  // pengguna (fitur "Aktifkan Lokasi" / nearby jobs & nearby workers).
  // role di sini adalah worker/employer/admin -- kecualikan akun admin.
  const { data: profiles } = await supabase.from("profiles").select("city, district").neq("role", "admin");

  const cityRows = aggregate((profiles || []).map((p) => p.city));
  const districtRows = aggregate((profiles || []).map((p) => p.district));
  const withLocationCount = (profiles || []).filter((p) => p.city).length;
  const totalUsers = (profiles || []).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <MapPin size={22} className="text-turquoise" /> Lokasi Pengguna
        </h1>
        <p className="text-sm text-ink/60 mt-1">
          Diambil dari titik GPS perangkat pengguna (fitur pencarian pekerjaan/pekerja terdekat), diurutkan dari kota/kecamatan
          dengan pengguna terbanyak.
        </p>
        <p className="text-xs text-ink/40 mt-1">
          {withLocationCount} dari {totalUsers} pengguna sudah membagikan lokasi.
        </p>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Sebaran per Kota/Kabupaten</h2>
        <BarChart rows={cityRows} barClass="bg-turquoise" />
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Sebaran per Kecamatan</h2>
        <BarChart rows={districtRows} barClass="bg-gold" />
      </div>
    </div>
  );
}
