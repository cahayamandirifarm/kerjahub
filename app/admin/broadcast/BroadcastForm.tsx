"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "../_components/ConfirmModal";

const TARGET_OPTIONS: { value: "semua" | "employer" | "worker"; label: string }[] = [
  { value: "semua", label: "Semua pengguna" },
  { value: "employer", label: "Hanya Pemberi Kerja" },
  { value: "worker", label: "Hanya Pekerja / Penyedia Jasa" }
];

export default function BroadcastForm() {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState<"semua" | "employer" | "worker">("semua");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ count: number; title: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Judul notifikasi wajib diisi.");
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirmSend() {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("admin_broadcast_notification", {
      p_title: title.trim(),
      p_body: body.trim() || null,
      p_link: link.trim() || null,
      p_target: target
    });
    setLoading(false);
    setShowConfirm(false);

    if (rpcError) {
      setError(rpcError.message || "Gagal mengirim notifikasi.");
      return;
    }

    setSentInfo({ count: (data as number) ?? 0, title: title.trim() });
    setTitle("");
    setBody("");
    setLink("");
    setTarget("semua");
  }

  const targetLabel = TARGET_OPTIONS.find((t) => t.value === target)?.label || "";

  return (
    <>
      <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-6">
        <div>
          <label className="label">Judul Notifikasi</label>
          <input
            className="input"
            placeholder="Contoh: Pemeliharaan Sistem Malam Ini"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Isi Pesan (opsional)</label>
          <textarea
            className="input min-h-24"
            placeholder="Detail pengumuman untuk pengguna..."
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Link Tujuan (opsional)</label>
            <input
              className="input"
              placeholder="/marketplace atau https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Kirim ke</label>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value as any)}>
              {TARGET_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}
        {sentInfo && (
          <p className="text-sm text-turquoise-dark">
            Terkirim ke {sentInfo.count} pengguna — &quot;{sentInfo.title}&quot;
          </p>
        )}

        <button type="submit" className="btn-primary">
          Kirim Notifikasi
        </button>
      </form>

      {showConfirm && (
        <ConfirmModal
          title="Kirim broadcast notifikasi?"
          description={`Notifikasi "${title.trim()}" akan langsung terkirim ke ${targetLabel.toLowerCase()}. Aksi ini tidak bisa dibatalkan setelah dikirim.`}
          confirmLabel={loading ? "Mengirim..." : "Ya, Kirim Sekarang"}
          cancelLabel="Batal"
          loading={loading}
          onConfirm={handleConfirmSend}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
