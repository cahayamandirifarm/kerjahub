"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

/**
 * CTA "Pasang Penawaran Kerja" & "Pasang Mencari Kerja" di beranda.
 *
 * Sebelumnya tombol ini adalah <a href="/login"> statis — selalu melempar
 * ke halaman login walau user SUDAH login, sehingga terasa seperti akun
 * ke-logout. Sekarang kita cek status login lebih dulu:
 *  - Sudah login  -> langsung ke form pasang yang sesuai
 *  - Belum login  -> ke /login dengan ?next= supaya kembali otomatis
 *    setelah berhasil masuk (tidak menghapus sesi apa pun).
 */
export default function PostCTAButtons() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState<"employer" | "worker" | null>(null);

  async function goTo(destination: string, type: "employer" | "worker") {
    setChecking(type);
    // Pastikan state auth benar-benar terbaru (bukan hanya context lokal)
    // sebelum memutuskan arah navigasi, tanpa pernah memanggil signOut().
    const supabase = createClient();
    const {
      data: { user: freshUser }
    } = await supabase.auth.getUser();
    setChecking(null);

    if (!freshUser) {
      router.push(`/login?next=${encodeURIComponent(destination)}`);
      return;
    }
    router.push(destination);
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        type="button"
        disabled={loading || checking !== null}
        onClick={() => goTo("/dashboard/employer/post-job", "employer")}
        className="btn-primary disabled:opacity-70"
      >
        {checking === "employer" ? "Memuat..." : "Pasang Penawaran Kerja"}
      </button>
      <button
        type="button"
        disabled={loading || checking !== null}
        onClick={() => goTo("/dashboard/worker/post-listing", "worker")}
        className="btn-secondary disabled:opacity-70"
      >
        {checking === "worker" ? "Memuat..." : "Pasang Mencari Kerja"}
      </button>
      <a href="#daftar-kerja" className="btn-secondary !bg-transparent">
        Lihat lowongan
      </a>
    </div>
  );
}
