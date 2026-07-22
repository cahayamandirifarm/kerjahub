"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp, TrendingDown, Scale, Users2, Calendar } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

const AKUN_LABEL: Record<string, string> = {
  deposit: "Top Up Saldo",
  penarikan: "Penarikan Saldo",
  bayar_kerja: "Pembayaran Kerja (potongan saldo/escrow)",
  terima_upah: "Upah Diterima Pekerja",
  komisi_platform: "Komisi Platform (Pekerjaan)",
  komisi_referral: "Komisi Referral (Upline)",
  refund: "Pengembalian Saldo",
  escrow_dikonfirmasi: "Pembayaran Kerja via Escrow (Dikonfirmasi)",
  marketplace_dana_pembeli: "Order Marketplace Digital (Dana Pembeli)",
  marketplace_dibayar_penjual: "Marketplace Digital — Dibayarkan ke Penjual"
};

type Preset = "bulan_ini" | "bulan_lalu" | "tahun_ini" | "semua" | "custom";

interface Summary {
  pendapatan_komisi_kerja: number;
  pendapatan_komisi_marketplace: number;
  pendapatan_biaya_penarikan: number;
  total_pendapatan: number;
  beban_komisi_referral: number;
  total_beban: number;
  laba_bersih: number;
}
interface TrialRow {
  akun: string;
  jumlah_transaksi: number;
  total_nominal: number;
}
interface UplineRow {
  profile_id: string;
  full_name: string;
  referral_code: string;
  jumlah_downline: number | null;
  jumlah_transaksi_komisi: number;
  total_komisi: number;
}

export default function LaporanKeuanganPage() {
  const supabase = createClient();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [preset, setPreset] = useState<Preset>("bulan_ini");
  const [startDate, setStartDate] = useState(toDateInput(firstOfMonth));
  const [endDate, setEndDate] = useState(toDateInput(today));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trial, setTrial] = useState<TrialRow[]>([]);
  const [upline, setUpline] = useState<UplineRow[]>([]);

  function applyPreset(p: Preset) {
    setPreset(p);
    const now = new Date();
    if (p === "bulan_ini") {
      setStartDate(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(toDateInput(now));
    } else if (p === "bulan_lalu") {
      setStartDate(toDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(toDateInput(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (p === "tahun_ini") {
      setStartDate(toDateInput(new Date(now.getFullYear(), 0, 1)));
      setEndDate(toDateInput(now));
    } else if (p === "semua") {
      setStartDate("2000-01-01");
      setEndDate(toDateInput(now));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const pStart = `${startDate}T00:00:00`;
    const pEnd = `${endDate}T23:59:59.999`;

    const [summaryRes, trialRes, uplineRes] = await Promise.all([
      supabase.rpc("admin_financial_summary", { p_start: pStart, p_end: pEnd }).single(),
      supabase.rpc("admin_trial_balance", { p_start: pStart, p_end: pEnd }),
      supabase.rpc("admin_upline_commission_report", { p_start: pStart, p_end: pEnd })
    ]);

    if (summaryRes.error || trialRes.error || uplineRes.error) {
      setError(
        summaryRes.error?.message || trialRes.error?.message || uplineRes.error?.message || "Gagal memuat laporan."
      );
    } else {
      setSummary(summaryRes.data as Summary);
      setTrial((trialRes.data as TrialRow[]) || []);
      setUpline((uplineRes.data as UplineRow[]) || []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "bulan_ini", label: "Bulan Ini" },
    { key: "bulan_lalu", label: "Bulan Lalu" },
    { key: "tahun_ini", label: "Tahun Ini" },
    { key: "semua", label: "Semua Waktu" }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-2xl font-semibold">Laporan Keuangan</h1>
      </div>

      {/* -------- Filter periode -------- */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-ink/40 text-xs font-semibold">
          <Calendar size={14} /> Periode
        </div>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                preset === p.key ? "bg-turquoise text-paper" : "bg-white border border-line text-ink/60"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPreset("custom");
              setStartDate(e.target.value);
            }}
            className="text-xs border border-line rounded-lg px-2 py-1.5"
          />
          <span className="text-ink/30 text-xs">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPreset("custom");
              setEndDate(e.target.value);
            }}
            className="text-xs border border-line rounded-lg px-2 py-1.5"
          />
        </div>
      </div>

      {error && <div className="card p-4 mb-6 text-sm text-clay">{error}</div>}
      {loading && <div className="card p-6 text-center text-ink/50 text-sm mb-6">Memuat laporan...</div>}

      {!loading && summary && (
        <>
          {/* -------- Laba Rugi -------- */}
          <h2 className="font-display text-lg font-semibold mb-3">Laba Rugi</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm text-ink/50">
                <TrendingUp size={16} className="text-turquoise" /> Komisi Platform (Kerja)
              </div>
              <p className="font-display text-xl font-semibold mt-1">
                {formatRupiah(summary.pendapatan_komisi_kerja)}
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm text-ink/50">
                <TrendingUp size={16} className="text-turquoise" /> Komisi Marketplace Digital
              </div>
              <p className="font-display text-xl font-semibold mt-1">
                {formatRupiah(summary.pendapatan_komisi_marketplace)}
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm text-ink/50">
                <TrendingUp size={16} className="text-turquoise" /> Biaya Admin Penarikan
              </div>
              <p className="font-display text-xl font-semibold mt-1">
                {formatRupiah(summary.pendapatan_biaya_penarikan)}
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-sm text-ink/50">
                <TrendingDown size={16} className="text-clay" /> Beban Komisi Referral (Upline)
              </div>
              <p className="font-display text-xl font-semibold mt-1 text-clay">
                − {formatRupiah(summary.beban_komisi_referral)}
              </p>
            </div>
            <div className="card p-5 bg-ink text-paper">
              <div className="flex items-center gap-2 text-sm text-paper/60">
                <Scale size={16} className="text-gold" /> Laba Bersih
              </div>
              <p
                className={`font-display text-xl font-semibold mt-1 ${
                  summary.laba_bersih >= 0 ? "text-turquoise" : "text-clay"
                }`}
              >
                {formatRupiah(summary.laba_bersih)}
              </p>
            </div>
          </div>

          {/* -------- Neraca Saldo -------- */}
          <h2 className="font-display text-lg font-semibold mb-3">Neraca Saldo — Ringkasan per Akun</h2>
          <p className="text-xs text-ink/40 mb-3">
            Rekap mutasi tiap jenis transaksi/sumber dana yang sudah berhasil/selesai dalam periode terpilih.
          </p>
          <div className="card overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead className="bg-paper text-ink/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Akun</th>
                  <th className="text-right px-4 py-3">Jumlah Transaksi</th>
                  <th className="text-right px-4 py-3">Total Nominal</th>
                </tr>
              </thead>
              <tbody>
                {trial.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-ink/40">
                      Tidak ada transaksi pada periode ini.
                    </td>
                  </tr>
                )}
                {trial.map((r) => (
                  <tr key={r.akun} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{AKUN_LABEL[r.akun] ?? r.akun}</td>
                    <td className="px-4 py-3 text-right text-ink/60">{r.jumlah_transaksi}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatRupiah(r.total_nominal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* -------- Komisi Upline -------- */}
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Users2 size={18} className="text-turquoise" /> Komisi Upline (Referral)
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-ink/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Nama Upline</th>
                  <th className="text-left px-4 py-3">Kode Referral</th>
                  <th className="text-right px-4 py-3">Downline</th>
                  <th className="text-right px-4 py-3">Jumlah Transaksi Komisi</th>
                  <th className="text-right px-4 py-3">Total Komisi Diterima</th>
                </tr>
              </thead>
              <tbody>
                {upline.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink/40">
                      Belum ada komisi referral yang cair pada periode ini.
                    </td>
                  </tr>
                )}
                {upline.map((r) => (
                  <tr key={r.profile_id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-ink/60">{r.referral_code}</td>
                    <td className="px-4 py-3 text-right text-ink/60">{r.jumlah_downline ?? "-"}</td>
                    <td className="px-4 py-3 text-right text-ink/60">{r.jumlah_transaksi_komisi}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gold-dark">
                      {formatRupiah(r.total_komisi)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
