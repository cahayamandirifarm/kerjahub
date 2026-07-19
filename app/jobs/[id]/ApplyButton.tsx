"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ApplyButton({ jobId, jobStage }: { jobId: string; jobStage: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setError(null);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // GATE: belum login -> arahkan ke halaman login, lalu kembali ke sini
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/jobs/${jobId}`)}`);
      return;
    }

    setSending(true);
    const { error: insertError } = await supabase.from("applications").insert({
      job_id: jobId,
      worker_id: user.id,
      message: message || null
    });
    setSending(false);

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "Kamu sudah pernah melamar pekerjaan ini."
          : "Gagal mengirim lamaran, coba lagi."
      );
      return;
    }
    setDone(true);
  }

  if (jobStage !== "terbuka") {
    return (
      <div className="card p-4 text-center text-sm text-ink/50">
        Pekerjaan ini sudah tidak menerima lamaran.
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-4 text-center text-forest font-semibold">
        Lamaran terkirim! Pemberi kerja akan dihubungi lewat notifikasi.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Pesan singkat (opsional)</label>
        <textarea
          className="input min-h-[90px]"
          placeholder="Ceritakan pengalaman atau ketersediaan waktumu..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      <button onClick={handleApply} disabled={sending} className="btn-primary w-full">
        {sending ? "Mengirim..." : "Lamar Pekerjaan Ini"}
      </button>
    </div>
  );
}
