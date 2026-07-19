import { createClient } from "@/lib/supabase/server";
import SuspendToggle from "./SuspendToggle";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminUsersPage() {
  const supabase = createClient();
  const { data: users } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Pengguna</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nama</th>
              <th className="text-left px-4 py-3">Peran</th>
              <th className="text-left px-4 py-3">KYC</th>
              <th className="text-left px-4 py-3">Saldo</th>
              <th className="text-left px-4 py-3">Bergabung</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3 capitalize">{u.kyc_status}</td>
                <td className="px-4 py-3">{formatRupiah(u.wallet_balance)}</td>
                <td className="px-4 py-3 text-ink/50">
                  {new Date(u.created_at).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3">
                  {u.is_suspended ? (
                    <span className="text-clay font-semibold">Ditangguhkan</span>
                  ) : (
                    <span className="text-turquoise font-semibold">Aktif</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.role !== "admin" && <SuspendToggle userId={u.id} isSuspended={u.is_suspended} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
