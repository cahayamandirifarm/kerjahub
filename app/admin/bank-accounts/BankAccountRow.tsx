"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
}

export default function BankAccountRow({ account }: { account: BankAccount }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleToggleActive() {
    setLoading(true);
    await supabase.from("bank_accounts").update({ is_active: !account.is_active }).eq("id", account.id);
    setLoading(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Hapus rekening ${account.bank_name} — ${account.account_number}?`)) return;
    setLoading(true);
    const { error } = await supabase.from("bank_accounts").delete().eq("id", account.id);
    setLoading(false);
    if (error) {
      alert("Gagal menghapus rekening: " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{account.bank_name}</p>
        <p className="text-sm text-ink/60">
          {account.account_number} — a.n. {account.account_holder}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={loading}
          className={`badge-stage ${account.is_active ? "stage-terbuka" : "stage-selesai"}`}
        >
          {account.is_active ? "Aktif" : "Nonaktif"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          title="Hapus rekening"
          className="p-2 rounded-lg text-clay hover:bg-clay/10 disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
