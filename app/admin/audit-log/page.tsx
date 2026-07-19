import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditLogPage() {
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("audit_log")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Audit Log Aktivitas</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Waktu</th>
              <th className="text-left px-4 py-3">Pelaku</th>
              <th className="text-left px-4 py-3">Aksi</th>
              <th className="text-left px-4 py-3">Entitas</th>
            </tr>
          </thead>
          <tbody>
            {logs?.map((l: any) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink/50 whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3">{l.profiles?.full_name ?? "Sistem"}</td>
                <td className="px-4 py-3">{l.action}</td>
                <td className="px-4 py-3 text-ink/60">
                  {l.entity} {l.entity_id ? `#${l.entity_id.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
