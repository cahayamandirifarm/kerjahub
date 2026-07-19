import { createClient } from "@/lib/supabase/server";
import BankAccountForm from "./BankAccountForm";

export default async function AdminBankAccountsPage() {
  const supabase = createClient();
  const { data: accounts } = await supabase.from("bank_accounts").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Rekening Bank Platform</h1>
      <p className="text-sm text-ink/60 mb-4">
        Rekening yang aktif paling atas akan otomatis dipakai sebagai tujuan transfer escrow untuk pembayaran baru.
      </p>
      <BankAccountForm />
      <div className="space-y-2 mt-6">
        {accounts?.map((a) => (
          <div key={a.id} className="card p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{a.bank_name}</p>
              <p className="text-sm text-ink/60">
                {a.account_number} — a.n. {a.account_holder}
              </p>
            </div>
            <span className={`badge-stage ${a.is_active ? "stage-terbuka" : "stage-selesai"}`}>
              {a.is_active ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
