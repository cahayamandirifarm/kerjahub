import { createClient } from "@/lib/supabase/server";
import BankAccountForm from "./BankAccountForm";
import BankAccountActions from "./BankAccountActions";

export default async function AdminBankAccountsPage() {
  const supabase = createClient();
  const { data: accounts } = await supabase.from("bank_accounts").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Rekening Bank Platform</h1>
      <p className="text-sm text-ink/60 mb-4">
        Rekening yang aktif paling atas akan otomatis dipakai sebagai tujuan transfer escrow untuk pembayaran baru.
        Daftar ini boleh dikosongkan (nonaktifkan/hapus semua) -- kalau tidak ada rekening aktif, sistem tidak akan
        menyertakan tujuan transfer bank untuk escrow baru.
      </p>
      <BankAccountForm />
      <div className="space-y-2 mt-6">
        {(!accounts || accounts.length === 0) && (
          <div className="card p-6 text-center text-sm text-ink/50">Belum ada rekening bank platform.</div>
        )}
        {accounts?.map((a) => (
          <div key={a.id} className="card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{a.bank_name}</p>
              <p className="text-sm text-ink/60">
                {a.account_number} — a.n. {a.account_holder}
              </p>
              <span className={`badge-stage ${a.is_active ? "stage-terbuka" : "stage-selesai"} mt-1 inline-block`}>
                {a.is_active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            <BankAccountActions id={a.id} bankName={a.bank_name} isActive={a.is_active} />
          </div>
        ))}
      </div>
    </div>
  );
}
