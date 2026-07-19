"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail, isValidUsername, isValidPhone } from "@/lib/auth-helpers";
import Link from "next/link";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard/employer";

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidUsername(username)) {
      setError("Username 4-20 karakter, hanya huruf, angka, titik, atau garis bawah.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Nomor HP tidak valid. Contoh: 081234567890.");
      return;
    }
    if (password.length < 6) {
      setError("Kata sandi minimal 6 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data: available } = await supabase.rpc("is_username_available", { p_username: username });
    if (available === false) {
      setLoading(false);
      setError("Username sudah dipakai, coba yang lain.");
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: {
        data: { username, phone }
      }
    });

    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.includes("registered")
          ? "Username sudah dipakai, coba yang lain."
          : "Gagal mendaftar, coba lagi."
      );
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password
    });
    setLoading(false);
    if (loginError) {
      router.push("/login");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-paper py-10">
      <div className="card w-full max-w-sm p-8">
        <Link href="/" className="font-display text-2xl font-semibold text-turquoise-dark block text-center">
          Kerja<span className="text-gold-dark">Hub</span>
        </Link>
        <h1 className="font-display text-xl font-semibold mt-6 mb-2 text-center">Buat Akun Baru</h1>
        <p className="text-sm text-ink/60 mb-6 text-center">
          Cukup username, kata sandi, dan nomor HP — simpel dan cepat.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              required
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="contoh: budi_kerja"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nomor HP</label>
            <input
              className="input"
              required
              type="tel"
              placeholder="081234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-ink/40 mt-1">Hanya tampil di profil, tidak untuk login.</p>
          </div>
          <div>
            <label className="label">Kata Sandi</label>
            <input
              className="input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Konfirmasi Kata Sandi</label>
            <input
              className="input"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Mendaftar..." : "Daftar"}
          </button>
        </form>

        <p className="text-sm text-ink/60 mt-6 text-center">
          Sudah punya akun?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-turquoise font-semibold">
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink/40 text-sm">Memuat...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
