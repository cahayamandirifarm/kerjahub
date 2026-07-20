import { createClient } from "@/lib/supabase/server";
import BankAccountForm from "./BankAccountForm";
import BankAccountRow from "./BankAccountRow";

export default async function AdminBankAccountsPage() {
  const supabase = createClient();
  const { data: accounts } = await supabase.from("bank_accounts").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Rekening Bank Platform</h1>
      <p className="text-sm text-ink/60 mb-4">
        Rekening yang aktif paling atas akan otomatis dipakai sebagai tujuan transfer escrow untuk pembayaran baru.
        Klik badge status untuk mengubah aktif/nonaktif, atau hapus rekening yang sudah tidak dipakai. Daftar ini
        boleh dikosongkan — jika tidak ada rekening aktif, transfer escrow akan dibuat tanpa tujuan rekening.
      </p>
      <BankAccountForm />
      <div className="space-y-2 mt-6">
        {accounts && accounts.length > 0 ? (
          accounts.map((a) => <BankAccountRow key={a.id} account={a} />)
        ) : (
          <p className="text-sm text-ink/40 text-center py-6">Belum ada rekening bank platform.</p>
        )}
      </div>
    </div>
  );
}
