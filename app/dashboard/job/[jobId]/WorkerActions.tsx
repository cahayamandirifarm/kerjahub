"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function toWaNumber(phone: string | null) {
  if (!phone) return null;
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return p;
}

export default function WorkerActions({
  jobId,
  stage,
  employerPhone,
  employerName,
  jobTitle,
  photoCount
}: {
  jobId: string;
  stage: string;
  employerPhone: string | null;
  employerName: string | null;
  jobTitle: string;
  photoCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleStartWork() {
    setLoading(true);
    const { error: rpcError } = await supabase.rpc("start_work", { p_job_id: jobId });
    setLoading(false);
    if (rpcError) {
      alert(rpcError.message);
      return;
    }
    const wa = toWaNumber(employerPhone);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user?.id).single();
    const today = new Date().toLocaleDateString("id-ID");
    const text = encodeURIComponent(
      `Halo ${employerName ?? ""}, saya ${profile?.full_name ?? ""}. Saya telah menekan tombol Mulai Bekerja untuk pekerjaan "${jobTitle}" (ID: ${jobId.slice(0, 8)}) dan siap memulai pekerjaan.\nNomor saya: ${profile?.phone ?? "-"}\nTanggal: ${today}`
    );
    if (wa) {
      window.open(`https://wa.me/${wa}?text=${text}`, "_blank");
    }
    router.refresh();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (photoCount + selected.length > 10) {
      setError("Maksimal 10 foto total.");
      return;
    }
    setError(null);
    setFiles(selected);
  }

  async function handleUploadAndSubmit() {
    setError(null);
    if (photoCount === 0 && files.length === 0) {
      setError("Unggah minimal 1 foto hasil pekerjaan.");
      return;
    }
    setLoading(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    for (const file of files) {
      const path = `${user.id}/${jobId}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file);
      if (uploadError) continue;
      const { data: urlData } = await supabase.storage.from("job-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (urlData?.signedUrl) {
        await supabase.from("job_photos").insert({ job_id: jobId, uploaded_by: user.id, url: urlData.signedUrl });
      }
    }

    const { error: rpcError } = await supabase.rpc("submit_job_completion", { p_job_id: jobId });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  if (stage === "dana_diamankan") {
    return (
      <div className="card p-5">
        <p className="text-sm text-ink/60 mb-3">
          Dana sudah diamankan platform. Tekan tombol di bawah untuk mulai bekerja — kamu akan diarahkan ke WhatsApp pemberi kerja.
        </p>
        <button onClick={handleStartWork} disabled={loading} className="btn-primary w-full">
          {loading ? "Memproses..." : "Mulai Bekerja"}
        </button>
      </div>
    );
  }

  if (stage === "dikerjakan" || stage === "revisi") {
    return (
      <div className="card p-5">
        {stage === "revisi" && (
          <p className="text-sm text-clay mb-3">Pemberi kerja meminta revisi. Unggah ulang foto hasil terbaru.</p>
        )}
        <label className="label">Foto Hasil Pekerjaan (1-10 foto)</label>
        <input className="input" type="file" accept="image/*" multiple onChange={handleFileChange} />
        {error && <p className="text-sm text-clay mt-2">{error}</p>}
        <button onClick={handleUploadAndSubmit} disabled={loading} className="btn-primary w-full mt-3">
          {loading ? "Mengirim..." : "Konfirmasi Pekerjaan Selesai"}
        </button>
      </div>
    );
  }

  if (stage === "menunggu_konfirmasi_selesai") {
    return <div className="card p-5 text-sm text-ink/60">Menunggu konfirmasi dari pemberi kerja.</div>;
  }

  return null;
}
