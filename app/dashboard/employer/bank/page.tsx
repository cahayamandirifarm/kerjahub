"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EmployerBankAccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ bank_name: "", bank_account_number: "", bank_account_holder: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=/dashboard/employer/bank");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("bank_name, bank_account_number, bank_account_holder")
        .eq("id", user.id)
        .single();
      if (data) {
        setForm({
          bank_name: data.bank_name || "",
          bank_account_number: data.bank_account_number || "",
          bank_account_holder: data.bank_account_holder || ""
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    setLoading(false);
    setMessage(error ? "Gagal menyimpan data." : "Data rekening/e-wallet tersimpan.");
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Data Rekening Bank / E-Wallet</h1>
      <p className="text-sm text-ink/60 mb-6">Digunakan untuk mencairkan penarikan saldo.</p>

      <form onSubmit={handleSubmit} className="space-y-4 card p-5">
        <div>
          <label className="label">Nama Bank / E-Wallet</label>
          <input
            className="input"
            required
            placeholder="Contoh: BCA, atau DANA / OVO / GoPay untuk e-wallet"
            value={form.bank_name}
            onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Nomor Rekening / Nomor E-Wallet</label>
          <input
            className="input"
            required
            placeholder="Nomor rekening atau nomor HP e-wallet"
            value={form.bank_account_number}
            onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Nama Pemilik Rekening / E-Wallet</label>
          <input
            className="input"
            required
            value={form.bank_account_holder}
            onChange={(e) => setForm((f) => ({ ...f, bank_account_holder: e.target.value }))}
          />
        </div>
        {message && <p className="text-sm text-turquoise">{message}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Menyimpan..." : "Simpan"}
        </button>
      </form>
    </div>
  );
}
