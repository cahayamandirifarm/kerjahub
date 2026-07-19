"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BankAccountForm() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ bank_name: "", account_number: "", account_holder: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.from("bank_accounts").insert(form);
    setLoading(false);
    setForm({ bank_name: "", account_number: "", account_holder: "" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 grid sm:grid-cols-4 gap-3 items-end">
      <div>
        <label className="label">Nama Bank</label>
        <input
          className="input"
          required
          value={form.bank_name}
          onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">Nomor Rekening</label>
        <input
          className="input"
          required
          value={form.account_number}
          onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
        />
      </div>
      <div>
        <label className="label">Atas Nama</label>
        <input
          className="input"
          required
          value={form.account_holder}
          onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
        />
      </div>
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Menyimpan..." : "Tambah Rekening"}
      </button>
    </form>
  );
}
