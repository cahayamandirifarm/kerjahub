"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABEL: Record<string, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_konfirmasi_admin: "Menunggu Konfirmasi Admin",
  berhasil: "Pembayaran Berhasil",
  ditolak: "Bukti Ditolak — unggah ulang"
};

export default function EscrowPaymentForm({
  escrowId,
  status,
  proofUrl
}: {
  escrowId: string;
  status: string;
  proofUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Pilih bukti transfer terlebih dahulu.");
      return;
    }
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const path = `${user.id}/${escrowId}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file);
    if (uploadError) {
      setLoading(false);
      setError("Gagal mengunggah bukti.");
      return;
    }
    const { data: urlData } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 60 * 24 * 365);

    const { error: rpcError } = await supabase.rpc("submit_escrow_proof", {
      p_escrow_id: escrowId,
      p_proof_url: urlData?.signedUrl
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="card p-5">
      <p className="text-sm font-semibold mb-3">
        Status: <span className="text-forest">{STATUS_LABEL[status] ?? status}</span>
      </p>

      {proofUrl && (
        <a href={proofUrl} target="_blank" className="text-sm text-forest underline block mb-3">
          Lihat bukti yang sudah diunggah
        </a>
      )}

      {(status === "menunggu_pembayaran" || status === "ditolak") && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Unggah Bukti Transfer</label>
            <input
              className="input"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mengirim..." : "Kirim Bukti Pembayaran"}
          </button>
        </form>
      )}

      {status === "menunggu_konfirmasi_admin" && (
        <p className="text-sm text-ink/60">Bukti sudah dikirim, menunggu verifikasi admin (biasanya &lt; 1x24 jam).</p>
      )}

      {status === "berhasil" && (
        <p className="text-sm text-forest font-semibold">
          Dana sudah diamankan platform. Pekerja bisa mulai bekerja sekarang.
        </p>
      )}
    </div>
  );
}
