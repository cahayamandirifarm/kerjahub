"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { ShieldCheck, Volume2, VolumeX } from "lucide-react";

export default function KycPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProfile() {
    if (!user) {
      router.push("/login?next=/kyc");
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    setProfile(data);
    setFullName(data?.full_name || "");
    setPhone(data?.phone || "");
  }

  useEffect(() => {
    if (user !== undefined) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    if (!user) return;

    let selfie_url = profile?.kyc_selfie_url;
    if (selfieFile) {
      const path = `${user.id}/selfie-${Date.now()}-${selfieFile.name}`;
      const { error } = await supabase.storage.from("kyc-docs").upload(path, selfieFile);
      if (!error) {
        const { data } = await supabase.storage.from("kyc-docs").createSignedUrl(path, 60 * 60 * 24 * 365);
        selfie_url = data?.signedUrl;
      }
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        kyc_selfie_url: selfie_url,
        avatar_url: selfie_url || profile?.avatar_url,
        kyc_status: selfie_url ? "menunggu" : profile?.kyc_status
      })
      .eq("id", user.id);

    setLoading(false);
    setMessage(updateError ? "Gagal menyimpan." : "Data terkirim, menunggu verifikasi admin.");
    loadProfile();
    refreshProfile();
  }

  async function toggleSound() {
    if (!user || !profile) return;
    const next = !profile.notif_sound_enabled;
    await supabase.from("profiles").update({ notif_sound_enabled: next }).eq("id", user.id);
    setProfile((p: any) => ({ ...p, notif_sound_enabled: next }));
    refreshProfile();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const statusLabel: Record<string, string> = {
    belum: "Belum Verifikasi",
    menunggu: "Menunggu Verifikasi",
    terverifikasi: "Terverifikasi",
    ditolak: "Ditolak — silakan unggah ulang selfie"
  };

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="font-display text-2xl font-semibold mb-1">Akun & Verifikasi</h1>
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest mb-6">
          <ShieldCheck size={15} /> Status: {statusLabel[profile?.kyc_status || "belum"]}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 card p-5">
          <div>
            <label className="label">Nama Lengkap</label>
            <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Nomor HP</label>
            <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Foto Selfie Wajah</label>
            {profile?.kyc_selfie_url && (
              <img src={profile.kyc_selfie_url} alt="Selfie" className="w-20 h-20 rounded-full object-cover mb-2 border border-line" />
            )}
            <input className="input" type="file" accept="image/*" capture="user" onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} />
            <p className="text-xs text-ink/40 mt-1">Cukup 1 foto selfie wajah yang jelas, tanpa perlu unggah KTP.</p>
          </div>
          {message && <p className="text-sm text-forest">{message}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Menyimpan..." : "Kirim Verifikasi"}
          </button>
        </form>

        <div className="card p-4 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {profile?.notif_sound_enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            Suara notifikasi
          </div>
          <button
            onClick={toggleSound}
            className={`w-11 h-6 rounded-full transition relative ${profile?.notif_sound_enabled ? "bg-forest" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${profile?.notif_sound_enabled ? "left-5" : "left-0.5"}`}
            />
          </button>
        </div>

        <button onClick={handleLogout} className="btn-secondary w-full mt-6">
          Keluar dari Akun
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
