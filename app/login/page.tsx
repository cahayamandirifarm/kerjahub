"use client";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth-helpers";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard/employer";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    // Batas waktu 15 detik -- sebelumnya kalau server Supabase lambat/tidak
    // merespons (mis. project lagi paused/bangun dari sleep di tier gratis),
    // tombol ini akan menggantung selamanya di "Masuk..." tanpa pesan apa
    // pun ke pengguna. Sekarang minimal muncul pesan jelas, bukan macet diam.
    let data, authError;
    try {
      const res = await withTimeout(
        supabase.auth.signInWithPassword({ email: usernameToEmail(username), password }),
        15000
      );
      data = res.data;
      authError = res.error;
    } catch {
      setLoading(false);
      setError("Server tidak merespons. Cek koneksi internet kamu dan coba lagi.");
      return;
    }
    if (authError || !data.user) {
      setLoading(false);
      setError("Username atau kata sandi salah.");
      return;
    }
    let profile;
    try {
      const res = await withTimeout(
        supabase.from("profiles").select("role").eq("id", data.user.id).single(),
        15000
      );
      profile = res.data;
    } catch {
      // Auth-nya sendiri sudah berhasil -- kalaupun cek role telat, tetap
      // lanjutkan masuk daripada menggantung selamanya di sini.
      profile = null;
    }
    if (profile?.role === "admin") {
      await supabase.auth.signOut();
      setLoading(false);
      setError("Akun ini khusus untuk Admin Panel dan tidak bisa digunakan untuk masuk ke aplikasi pengguna.");
      return;
    }
    setLoading(false);
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper">
      <div className="card w-full max-w-sm p-8">
        <Link href="/" className="font-display text-2xl font-semibold text-turquoise-dark block text-center">
          Kerja<span className="text-gold-dark">Hub</span>
        </Link>
        <h1 className="font-display text-xl font-semibold mt-6 mb-2 text-center">Masuk ke Akun</h1>
        <p className="text-sm text-ink/60 mb-6 text-center">
          Masuk dengan username dan kata sandi kamu.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              required
              autoCapitalize="off"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="contoh: budi_kerja"
            />
          </div>
          <div>
            <label className="label">Kata Sandi</label>
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>

        <p className="text-sm text-ink/60 mt-6 text-center">
          Belum punya akun?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-turquoise font-semibold">
            Daftar di sini
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink/40 text-sm">Memuat...</div>}>
      <LoginForm />
    </Suspense>
  );
}
