"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

// Saldo di-render duluan dari nilai yang sudah diambil server (initialBalance,
// select("*") sekali saat halaman dibuka -- TETAP tidak di-cache, sesuai
// aturan "saldo/escrow wajib selalu fresh" di lib/client-cache.ts). Setelah
// itu, komponen ini TIDAK query ulang ke Supabase sama sekali -- cuma
// dengar 1 channel Realtime yang baru mendorong angka baru KETIKA baris
// profil user berubah (mis. dari transaksi/top up/withdraw/escrow). Jadi
// beban ke database cuma nol query tambahan per kunjungan; database hanya
// mendorong perubahan saat memang ada transaksi.
export default function LiveWalletBalance({ userId, initialBalance }: { userId: string; initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`wallet-balance:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as any)?.wallet_balance;
          if (typeof next === "number") setBalance(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return <>{formatRupiah(balance)}</>;
}
