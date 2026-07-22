"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "../_components/ConfirmModal";

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
  const [sign, setSign] = useState<1 | -1>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setNote("");
    setSign(1);
    setError(null);
  }

  async function submit() {
    const raw = Number(amount);
    if (!raw || raw <= 0) {
      setError("Masukkan jumlah yang valid (lebih dari 0).");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("admin_adjust_balance", {
      _target_user_id: userId,
      _amount: raw * sign,
      _note: note || null
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-ink/70 hover:text-ink">
        Edit Saldo
      </button>

      {open && (
        <ConfirmModal
          title="Edit Saldo Pengguna"
          confirmLabel={loading ? "Memproses..." : sign === 1 ? "Tambah Saldo" : "Kurangi Saldo"}
          confirmVariant={sign === 1 ? "primary" : "danger"}
          loading={loading}
          onConfirm={submit}
          onClose={() => {
            setOpen(false);
            reset();
          }}
        >
          <div className="text-xs text-ink/50">
            Pengguna: <span className="font-medium text-ink">{username}</span>
            <br />
            Saldo saat ini: Rp {Number(currentBalance ?? 0).toLocaleString("id-ID")}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSign(1)}
              disabled={loading}
              className={`flex-1 text-xs font-semibold rounded-lg py-2 border transition-colors ${
                sign === 1 ? "bg-turquoise/10 border-turquoise text-turquoise-dark" : "border-line text-ink/50"
              }`}
            >
              + Tambah
            </button>
            <button
              type="button"
              onClick={() => setSign(-1)}
              disabled={loading}
              className={`flex-1 text-xs font-semibold rounded-lg py-2 border transition-colors ${
                sign === -1 ? "bg-clay/10 border-clay text-clay" : "border-line text-ink/50"
              }`}
            >
              − Kurangi
            </button>
          </div>

          <input
            type="number"
            min="1"
            placeholder="Jumlah (Rp)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input !py-2.5 !px-3 !rounded-lg text-sm"
            disabled={loading}
          />
          <input
            type="text"
            placeholder="Catatan (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input !py-2.5 !px-3 !rounded-lg text-sm"
            disabled={loading}
          />

          {error && <p className="text-sm text-clay">{error}</p>}
        </ConfirmModal>
      )}
    </>
  );
}
