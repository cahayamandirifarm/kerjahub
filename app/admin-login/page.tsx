"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setLoading(false);
      setError("Email atau kata sandi salah.");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
    setLoading(false);
    if (profile?.role !== "admin") {
      setError("Akun ini bukan admin.");
      await supabase.auth.signOut();
      return;
    }
    router.push("/admin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink">
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-semibold mb-1">KerjaHub Admin</h1>
        <p className="text-sm text-ink/60 mb-6">Panel khusus tim internal.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Kata Sandi</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-clay">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Masuk..." : "Masuk sebagai Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
