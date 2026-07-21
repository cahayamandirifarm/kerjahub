"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, Users, Wallet, Copy, Check, Share2 } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default function ReferralPage() {
  const router = useRouter();
  const supabase = createClient();

  const [referralCode, setReferralCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [downlineCount, setDownlineCount] = useState(0);
  const [totalKomisi, setTotalKomisi] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login?next=/dashboard/referral");
      return;
    }
    const { data, error: rpcError } = await supabase.rpc("get_my_referral_info").single();
    if (!rpcError && data) {
      const row = data as { referral_code: string; downline_count: number; total_komisi_referral: number };
      setReferralCode(row.referral_code);
      setNewCode(row.referral_code);
      setDownlineCount(Number(row.downline_count));
      setTotalKomisi(Number(row.total_komisi_referral));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${referralCode}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const clean = newCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      setError("Kode referral harus 6 karakter, huruf/angka saja.");
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("update_my_referral_code", { p_new_code: clean });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message || "Gagal menyimpan kode referral.");
      return;
    }
    setReferralCode(clean);
    setMessage("Kode referral berhasil diubah.");
  }

  if (loading) {
    return <div className="text-center text-ink/40 text-sm py-10">Memuat...</div>;
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/employer" className="text-ink/50 hover:text-ink">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Share2 size={20} className="text-turquoise" /> Kode Referral Kamu
        </h1>
      </div>

      <div className="card p-5" style={{ backgroundColor: "#0f172a" }}>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Kode Referral Aktif</p>
        <p className="font-display font-bold tracking-widest mt-1" style={{ fontSize: 32, color: "#ffffff" }}>
          {referralCode}
        </p>
        <div className="flex items-center gap-2 mt-4">
          <input readOnly value={referralLink} className="input !text-xs flex-1 !bg-white/10 !text-white !border-white/20" />
          <button
            onClick={handleCopy}
            className="rounded-full px-3 py-2 text-sm font-semibold inline-flex items-center gap-1 shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.35)" }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Tersalin" : "Salin"}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
          Bagikan kode atau tautan ini. Setiap pengguna baru yang mendaftar pakai kode kamu akan jadi downline-mu.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-ink/50">
            <Users size={16} /> Downline
          </div>
          <p className="font-display text-2xl font-bold mt-1">{downlineCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-sm text-ink/50">
            <Wallet size={16} /> Total Komisi
          </div>
          <p className="font-display text-2xl font-bold mt-1 text-gold-dark">{formatRupiah(totalKomisi)}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="card p-5 space-y-4">
        <div>
          <label className="label">Ubah Kode Referral</label>
          <input
            className="input uppercase"
            maxLength={6}
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
          />
          <p className="text-xs text-ink/40 mt-1">6 karakter, huruf/angka saja. Kode yang sudah dibagikan sebelumnya tidak akan berlaku lagi setelah diubah.</p>
        </div>
        {error && <p className="text-sm text-clay">{error}</p>}
        {message && <p className="text-sm text-turquoise">{message}</p>}
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "Menyimpan..." : "Simpan Kode Baru"}
        </button>
      </form>

      <p className="text-xs text-ink/40 text-center">
        Kamu mendapat komisi 10% dari komisi platform setiap transaksi sukses downline-mu, otomatis masuk ke saldo dompet dan Riwayat Transaksi.
      </p>
    </div>
  );
}
