"use client";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

type Props = {
  open: boolean;
  /** Status kyc saat ini, dipakai untuk menyesuaikan pesan (menunggu review vs belum sama sekali vs ditolak). */
  kycStatus?: "belum" | "menunggu" | "ditolak" | "terverifikasi" | null;
  onClose: () => void;
};

const MESSAGE: Record<string, string> = {
  menunggu: "Verifikasi akun (KYC) kamu sedang ditinjau admin. Kamu bisa memposting lowongan/jasa atau menjual produk setelah verifikasi disetujui.",
  ditolak: "Verifikasi akun (KYC) kamu sebelumnya ditolak. Silakan ajukan ulang dokumen KYC untuk bisa memposting lowongan/jasa atau menjual produk.",
  belum: "Untuk menjaga keamanan platform, hanya akun yang sudah verifikasi (KYC) yang bisa memposting lowongan/jasa atau menjual produk di marketplace."
};

export default function VerificationRequiredModal({ open, kycStatus, onClose }: Props) {
  const router = useRouter();
  if (!open) return null;

  const message = MESSAGE[kycStatus ?? "belum"] ?? MESSAGE.belum;
  const showVerifyButton = kycStatus !== "menunggu";

  return (
    <div className="fixed inset-0 z-[110] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-full bg-clay/10 text-clay flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>
        <h2 className="font-display text-lg font-bold text-ink mb-2">Akun Belum Terverifikasi</h2>
        <p className="text-sm text-ink/60 leading-relaxed mb-5">{message}</p>
        <div className="flex flex-col gap-2">
          {showVerifyButton && (
            <button onClick={() => router.push("/kyc")} className="btn-primary w-full">
              Verifikasi Akun Sekarang
            </button>
          )}
          <button onClick={onClose} className="btn-brand w-full">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
