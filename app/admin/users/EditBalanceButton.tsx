"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EditBalanceButton({
  userId,
  username,
  currentBalance
}: {
  userId: string;
  username: string;
  currentBalance: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(sign: 1 | -1) {
    const raw = Number(amount);
    if (!raw || raw <= 0) {
      alert("Masukkan jumlah yang valid (lebih dari 0).");
      return;
    }
    const signedAmount = raw * sign;
    const label = sign === 1 ? "menambah" : "mengurangi";
    const ok = confirm(
      `Yakin ${label} saldo "${username}" sebesar Rp ${raw.toLocaleString("id-ID")}?`
    );
    if (!ok) return;

    setLoading(true);
    const { error } = await supabase.rpc("admin_adjust_balance", {
      _target_user_id: userId,
      _amount: signedAmount,
      _note: note || null
    });
    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }
    setOpen(false);
    setAmount("");
    setNote("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-ink/70 hover:text-ink"
      >
        Edit Saldo
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start bg-paper border border-line rounded-lg p-2.5 w-56">
      <div className="text-xs text-ink/50">
        Saldo saat ini: Rp {Number(currentBalance ?? 0).toLocaleString("id-ID")}
      </div>
      <input
        type="number"
        min="1"
        placeholder="Jumlah (Rp)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full text-xs px-2 py-1.5 border border-line rounded"
        disabled={loading}
      />
      <input
        type="text"
        placeholder="Catatan (opsional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full text-xs px-2 py-1.5 border border-line rounded"
        disabled={loading}
      />
      <div className="flex gap-2 w-full">
        <button
          onClick={() => submit(1)}
          disabled={loading}
          className="flex-1 text-xs font-semibold text-turquoise border border-turquoise rounded py-1"
        >
          + Tambah
        </button>
        <button
          onClick={() => submit(-1)}
          disabled={loading}
          className="flex-1 text-xs font-semibold text-clay border border-clay rounded py-1"
        >
          − Kurangi
        </button>
      </div>
      <button
        onClick={() => {
          setOpen(false);
          setAmount("");
          setNote("");
        }}
        disabled={loading}
        className="text-xs text-ink/40 hover:text-ink/70"
      >
        Batal
      </button>
    </div>
  );
}
