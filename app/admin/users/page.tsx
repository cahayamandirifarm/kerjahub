import { createClient } from "@/lib/supabase/server";
import SuspendToggle from "./SuspendToggle";
import DeleteUserButton from "./DeleteUserButton";
import EditBalanceButton from "./EditBalanceButton";
import { usernameToEmail } from "@/lib/auth-helpers";

// UUID akun superadmin — hanya akun ini yang boleh mengubah saldo pengguna.
// Dicocokkan dengan pengecekan yang sama di fungsi database admin_adjust_balance,
// jadi tombolnya memang hanya tampil untuk superadmin, dan kalaupun ada yang
// mencoba memanggil RPC-nya langsung tanpa lewat tombol ini, tetap ditolak di database.
const SUPERADMIN_ID = "7eb76528-7597-4bbb-9d5a-e166202b38f8";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();
  const isSuperadmin = currentUser?.id === SUPERADMIN_ID;

  const q = searchParams?.q?.trim() || "";

  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (q) {
    query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
  }
  const { data: users } = await query;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-4">Pengguna</h1>
      <form method="GET" className="mb-4 flex gap-2 max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Cari nama atau username pengguna..."
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0 !px-4">
          Cari
        </button>
        {q && (
          <a href="/admin/users" className="btn-secondary shrink-0 !px-4 flex items-center">
            Reset
          </a>
        )}
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nama</th>
              <th className="text-left px-4 py-3">No. HP/WhatsApp</th>
              <th className="text-left px-4 py-3">Email</th>
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
                <td className="px-4 py-3 text-ink/70">{u.phone || "-"}</td>
                <td className="px-4 py-3 text-ink/50">{usernameToEmail(u.username)}</td>
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
                  <div className="flex flex-col gap-1.5 items-start">
                    {u.role !== "admin" && (
                      <>
                        <SuspendToggle userId={u.id} isSuspended={u.is_suspended} />
                        <DeleteUserButton userId={u.id} username={u.username} />
                      </>
                    )}
                    {isSuperadmin && (
                      <EditBalanceButton
                        userId={u.id}
                        username={u.username}
                        currentBalance={u.wallet_balance}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users?.length === 0 && (
          <div className="p-6 text-center text-ink/50 text-sm">
            {q ? `Tidak ada pengguna dengan nama/username "${q}".` : "Belum ada pengguna."}
          </div>
        )}
      </div>
    </div>
  );
}
