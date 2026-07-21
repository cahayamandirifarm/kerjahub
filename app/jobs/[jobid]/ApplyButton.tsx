"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SelfActionBlockedModal from "@/components/SelfActionBlockedModal";

export default function ApplyButton({
  jobId,
  jobStage,
  ownerId,
  isWorkerListing = false
}: {
  jobId: string;
  jobStage: string;
  ownerId: string;
  isWorkerListing?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

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

    // GATE: tidak boleh melamar/mengajak kerja sama ke postingan sendiri
    if (user.id === ownerId) {
      setShowBlocked(true);
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
      // Jaring pengaman kalau lolos dari pengecekan di atas tapi tertahan
      // oleh RLS di database (mis. ownerId di client sempat tidak sinkron).
      if (insertError.code === "42501") {
        setShowBlocked(true);
        return;
      }
      setError(
        insertError.code === "23505"
          ? isWorkerListing
            ? "Kamu sudah pernah mengajak kerja sama untuk tawaran ini."
            : "Kamu sudah pernah melamar pekerjaan ini."
          : "Gagal mengirim lamaran, coba lagi."
      );
      return;
    }
    setDone(true);
  }

  if (jobStage !== "terbuka") {
    return (
      <div className="card p-4 text-center text-sm text-ink/50">
        {isWorkerListing ? "Tawaran jasa ini sudah tidak menerima ajakan kerja sama." : "Pekerjaan ini sudah tidak menerima lamaran."}
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-4 text-center text-turquoise font-semibold">
        {isWorkerListing
          ? "Ajakan kerja sama terkirim! Pekerja akan dihubungi lewat notifikasi."
          : "Lamaran terkirim! Pemberi kerja akan dihubungi lewat notifikasi."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Pesan singkat (opsional)</label>
        <textarea
          className="input min-h-[90px]"
          placeholder={
            isWorkerListing
              ? "Ceritakan detail pekerjaan yang kamu tawarkan..."
              : "Ceritakan pengalaman atau ketersediaan waktumu..."
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-clay">{error}</p>}
      <button onClick={handleApply} disabled={sending} className="btn-primary w-full">
        {sending ? "Mengirim..." : isWorkerListing ? "Ajak Kerja Sama" : "Lamar Pekerjaan Ini"}
      </button>

      <SelfActionBlockedModal
        open={showBlocked}
        message={`Tidak dapat melakukan aksi ini karena postingan ini adalah milik Anda sendiri.`}
        onClose={() => setShowBlocked(false)}
      />
    </div>
  );
}
