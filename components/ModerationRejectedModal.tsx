"use client";
import { ShieldOff } from "lucide-react";

// Popup buat pesan penolakan filter kata terlarang (job/jasa & produk
// marketplace) -- sebelumnya cuma teks kecil warna merah di bawah form,
// gampang kelewat. Sekarang tampil sebagai popup di tengah layar biar
// jelas kelihatan alasannya, mengikuti pola SelfActionBlockedModal.tsx
// yang sudah ada.
export default function ModerationRejectedModal({
  open,
  message,
  onClose
}: {
  open: boolean;
  message: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-ink/70 backdrop-blur-sm flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-full bg-clay/10 text-clay flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={24} />
        </div>
        <h2 className="font-display text-lg font-bold text-ink mb-2">Ditolak oleh Sistem</h2>
        <p className="text-sm text-ink/60 leading-relaxed mb-5">{message}</p>
        <button onClick={onClose} className="btn-primary w-full">
          Mengerti
        </button>
      </div>
    </div>
  );
}
