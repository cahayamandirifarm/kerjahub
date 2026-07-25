"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { ShieldCheck, Volume2, VolumeX, Bell, BellOff } from "lucide-react";
import { getPushSubscriptionStatus, pushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { compressImage } from "@/lib/image-compress";

// Ekstrak path storage dari public URL bucket 'avatars' (mis.
// ".../storage/v1/object/public/avatars/<user_id>/avatar-xxx.jpg" ->
// "<user_id>/avatar-xxx.jpg"). Kalau avatar_url lama bukan dari bucket
// 'avatars' ini (mis. masih signed URL selfie KYC dari bucket 'kyc-docs'),
// hasilnya null -- jangan coba dihapus dari bucket yang salah.
function extractAvatarStoragePath(url: string): string | null {
  const marker = "/object/public/avatars/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

export default function KycPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [compressingSelfie, setCompressingSelfie] = useState(false);
  const [compressingKtp, setCompressingKtp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading">("loading");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB, sesuai batas yang diminta

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input value supaya bisa pilih file yang sama lagi kalau mau
    // upload ulang (mis. setelah error), tanpa perlu ganti file dulu.
    e.target.value = "";
    if (!file || !user) return;
    setAvatarError(null);

    if (!file.type.startsWith("image/")) {
      setAvatarError("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Ukuran foto maksimal 5MB.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8, maxSizeBytes: 700 * 1024 });
      const previousPath = profile?.avatar_url ? extractAvatarStoragePath(profile.avatar_url) : null;
      const path = `${user.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, compressed);
      if (uploadError) {
        setAvatarError("Gagal mengunggah foto. Coba lagi.");
        setUploadingAvatar(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq("id", user.id);

      if (updateError) {
        setAvatarError("Gagal menyimpan foto profil. Coba lagi.");
        setUploadingAvatar(false);
        return;
      }

      // Hapus file avatar lama (kalau ada dan memang disimpan di bucket
      // 'avatars' ini -- bukan URL selfie KYC lama dari bucket lain) supaya
      // tidak numpuk file tak terpakai.
      if (previousPath) {
        await supabase.storage.from("avatars").remove([previousPath]);
      }

      setProfile((p: any) => ({ ...p, avatar_url: publicUrlData.publicUrl }));
      refreshProfile();
    } catch {
      setAvatarError("Gagal memproses foto. Coba lagi.");
    }
    setUploadingAvatar(false);
  }

  useEffect(() => {
    if (!pushSupported()) {
      setPushStatus("unsupported");
      return;
    }
    getPushSubscriptionStatus().then(setPushStatus);
  }, []);

  async function togglePush() {
    if (!user) return;
    if (pushStatus === "subscribed") {
      await unsubscribeFromPush();
      setPushStatus("unsubscribed");
      return;
    }
    try {
      await subscribeToPush(user.id);
      setPushStatus("subscribed");
    } catch (err: any) {
      alert(err.message || "Gagal mengaktifkan notifikasi push.");
      setPushStatus(await getPushSubscriptionStatus());
    }
  }

  async function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelfieFile(null);
      return;
    }
    setCompressingSelfie(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.75, maxSizeBytes: 700 * 1024 });
      setSelfieFile(compressed);
    } catch {
      setSelfieFile(file);
    }
    setCompressingSelfie(false);
  }

  async function handleKtpChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setKtpFile(null);
      return;
    }
    setCompressingKtp(true);
    try {
      // KTP butuh resolusi lebih tinggi dari selfie supaya tulisan tetap terbaca.
      const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.75, maxSizeBytes: 1024 * 1024 });
      setKtpFile(compressed);
    } catch {
      setKtpFile(file);
    }
    setCompressingKtp(false);
  }

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

    let ktp_url = profile?.kyc_ktp_url;
    if (ktpFile) {
      const path = `${user.id}/ktp-${Date.now()}-${ktpFile.name}`;
      const { error } = await supabase.storage.from("kyc-docs").upload(path, ktpFile);
      if (!error) {
        const { data } = await supabase.storage.from("kyc-docs").createSignedUrl(path, 60 * 60 * 24 * 365);
        ktp_url = data?.signedUrl;
      }
    }

    const docsChanged = Boolean(selfieFile || ktpFile);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        kyc_selfie_url: selfie_url,
        kyc_ktp_url: ktp_url,
        avatar_url: selfie_url || profile?.avatar_url,
        kyc_status: docsChanged ? "menunggu" : profile?.kyc_status
      })
      .eq("id", user.id);

    setLoading(false);
    setMessage(updateError ? "Gagal menyimpan." : "Data terkirim, menunggu verifikasi admin.");
    setSelfieFile(null);
    setKtpFile(null);
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
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-turquoise mb-6">
          <ShieldCheck size={15} /> Status: {statusLabel[profile?.kyc_status || "belum"]}
        </p>

        <div className="card p-5 flex items-center gap-4 mb-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full bg-turquoise-light flex items-center justify-center font-display text-2xl font-semibold text-turquoise-dark overflow-hidden border border-line">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Foto profil" className="w-full h-full object-cover" />
              ) : (
                profile?.full_name?.[0]?.toUpperCase() ?? "?"
              )}
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-ink/40 flex items-center justify-center">
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink mb-0.5">Foto Profil</p>
            <p className="text-xs text-ink/45 mb-2">JPG/PNG, maksimal 5MB. Diambil dari galeri.</p>
            <label className="btn-secondary !py-1.5 !px-3 text-sm inline-flex cursor-pointer">
              {uploadingAvatar ? "Mengunggah..." : "Ganti Foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={handleAvatarChange}
              />
            </label>
            {avatarError && <p className="text-xs text-clay mt-1.5">{avatarError}</p>}
          </div>
        </div>

        {profile?.kyc_status === "terverifikasi" ? (
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-3">
              {profile?.kyc_selfie_url && (
                <img src={profile.kyc_selfie_url} alt="Selfie" className="w-14 h-14 rounded-full object-cover border border-line" />
              )}
              <div>
                <p className="font-semibold">{profile?.full_name}</p>
                <p className="text-sm text-ink/50">{profile?.phone}</p>
              </div>
            </div>
            <button type="button" disabled className="btn-primary w-full !bg-turquoise/20 !text-turquoise-dark cursor-default flex items-center justify-center gap-1.5">
              <ShieldCheck size={16} /> Terverifikasi
            </button>
            <p className="text-xs text-ink/40 text-center">Akun kamu sudah terverifikasi. Kamu tidak perlu mengajukan verifikasi lagi.</p>
          </div>
        ) : (
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
              <input className="input" type="file" accept="image/*" capture="user" onChange={handleSelfieChange} disabled={compressingSelfie} />
              {compressingSelfie ? (
                <p className="text-xs text-turquoise-dark mt-1">Mengompres foto...</p>
              ) : (
                <p className="text-xs text-ink/40 mt-1">Foto selfie wajah yang jelas, langsung dari kamera depan. Otomatis dikompres sebelum diunggah.</p>
              )}
            </div>
            <div>
              <label className="label">Foto KTP / SIM</label>
              {profile?.kyc_ktp_url && (
                <img src={profile.kyc_ktp_url} alt="KTP/SIM" className="w-full max-h-40 object-cover rounded-xl mb-2 border border-line" />
              )}
              <input className="input" type="file" accept="image/*" capture="environment" onChange={handleKtpChange} disabled={compressingKtp} />
              {compressingKtp ? (
                <p className="text-xs text-turquoise-dark mt-1">Mengompres foto...</p>
              ) : (
                <p className="text-xs text-ink/40 mt-1">Foto KTP atau SIM yang masih berlaku, pastikan seluruh data terbaca jelas. Otomatis dikompres sebelum diunggah.</p>
              )}
            </div>
            <div className="rounded-xl bg-turquoise/10 border border-turquoise/20 px-3 py-2.5">
              <p className="text-xs text-ink/70 leading-relaxed">
                <span className="font-semibold text-turquoise-dark">Catatan:</span> Nama akun yang kamu isi harus sama persis dengan nama pada KTP/SIM. Verifikasi akan ditolak apabila nama tidak sesuai dengan identitas.
              </p>
            </div>
            {profile?.kyc_status === "ditolak" && profile?.kyc_rejected_reason && (
              <p className="text-sm text-clay">Alasan ditolak: {profile.kyc_rejected_reason}</p>
            )}
            {message && <p className="text-sm text-turquoise">{message}</p>}
            <button type="submit" disabled={loading || compressingSelfie || compressingKtp} className="btn-primary w-full">
              {loading ? "Menyimpan..." : compressingSelfie || compressingKtp ? "Mengompres foto..." : "Kirim Verifikasi"}
            </button>
          </form>
        )}

        <div className="card p-4 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {profile?.notif_sound_enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            Suara notifikasi
          </div>
          <button
            onClick={toggleSound}
            className={`w-11 h-6 rounded-full transition relative ${profile?.notif_sound_enabled ? "bg-turquoise" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${profile?.notif_sound_enabled ? "left-5" : "left-0.5"}`}
            />
          </button>
        </div>

        {pushStatus !== "unsupported" && (
          <div className="card p-4 mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                {pushStatus === "subscribed" ? <Bell size={16} /> : <BellOff size={16} />}
                Notifikasi push
              </div>
              {pushStatus === "denied" && (
                <p className="text-[11px] text-clay mt-1">Izin diblokir di browser. Aktifkan lewat pengaturan situs.</p>
              )}
              {pushStatus !== "denied" && (
                <p className="text-[11px] text-ink/45 mt-1">Dapatkan notifikasi pesan chat baru walau aplikasi ditutup.</p>
              )}
            </div>
            <button
              onClick={togglePush}
              disabled={pushStatus === "denied" || pushStatus === "loading"}
              className={`w-11 h-6 rounded-full transition relative shrink-0 disabled:opacity-40 ${pushStatus === "subscribed" ? "bg-turquoise" : "bg-line"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${pushStatus === "subscribed" ? "left-5" : "left-0.5"}`}
              />
            </button>
          </div>
        )}

        <button onClick={handleLogout} className="btn-secondary w-full mt-6">
          Keluar dari Akun
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
