"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminTxActionButtons({
  source,
  id,
  onDone
}: {
  source: string;
  id: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState<"terima" | "tolak" | "batalkan" | null>(null);

  async function run(action: "terima" | "tolak" | "batalkan") {
    if (action === "batalkan" && !confirm("Batalkan transaksi ini? Aksi ini tidak bisa dibatalkan kembali.")) {
      return;
    }
    setLoading(action);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_action_transaction", {
      p_source: source,
      p_id: id,
      p_action: action
    });
    setLoading(null);
    if (error) {
      alert(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => run("terima")} disabled={loading !== null} className="btn-primary !px-3 !py-1.5 text-xs">
        {loading === "terima" ? "..." : "Terima"}
      </button>
      <button onClick={() => run("tolak")} disabled={loading !== null} className="btn-secondary !px-3 !py-1.5 text-xs">
        {loading === "tolak" ? "..." : "Tolak"}
      </button>
      <button
        onClick={() => run("batalkan")}
        disabled={loading !== null}
        className="!px-3 !py-1.5 text-xs rounded-full font-semibold bg-clay/10 text-clay hover:bg-clay/20 transition-colors"
      >
        {loading === "batalkan" ? "..." : "Batalkan"}
      </button>
    </div>
  );
}
