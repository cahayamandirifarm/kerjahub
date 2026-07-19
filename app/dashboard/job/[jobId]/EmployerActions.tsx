"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EmployerActions({
  jobId,
  stage,
  hasPhotos
}: {
  jobId: string;
  stage: string;
  hasPhotos: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [showRevision, setShowRevision] = useState(false);

  async function handleApprove() {
    setLoading(true);
    const { error } = await supabase.rpc("approve_completion", {
      p_job_id: jobId,
      p_rating: rating,
      p_review: review || null
    });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  async function handleRevision() {
    setLoading(true);
    const { error } = await supabase.rpc("request_revision", { p_job_id: jobId, p_note: revisionNote });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setShowRevision(false);
    router.refresh();
  }

  if (stage !== "menunggu_konfirmasi_selesai") return null;
  if (!hasPhotos) {
    return <div className="card p-5 text-sm text-ink/60">Menunggu pekerja mengunggah bukti hasil pekerjaan.</div>;
  }

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-display text-base font-semibold">Periksa & Konfirmasi</h2>

      {!showRevision ? (
        <>
          <div>
            <label className="label">Beri Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-2xl ${n <= rating ? "text-gold-dark" : "text-line"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Ulasan (opsional)</label>
            <textarea className="input min-h-[80px]" value={review} onChange={(e) => setReview(e.target.value)} />
          </div>
          <button onClick={handleApprove} disabled={loading} className="btn-primary w-full">
            {loading ? "Memproses..." : "Setujui Pekerjaan"}
          </button>
          <button onClick={() => setShowRevision(true)} className="btn-secondary w-full">
            Minta Revisi
          </button>
        </>
      ) : (
        <>
          <div>
            <label className="label">Catatan Revisi</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Jelaskan apa yang perlu diperbaiki..."
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
            />
          </div>
          <button onClick={handleRevision} disabled={loading} className="btn-gold w-full">
            {loading ? "Mengirim..." : "Kirim Permintaan Revisi"}
          </button>
          <button onClick={() => setShowRevision(false)} className="btn-secondary w-full">
            Batal
          </button>
        </>
      )}
    </div>
  );
}
