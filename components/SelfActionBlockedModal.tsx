"use client";
import { CircleSlash } from "lucide-react";

export default function SelfActionBlockedModal({
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
          <CircleSlash size={24} />
        </div>
        <h2 className="font-display text-lg font-bold text-ink mb-2">Tidak Bisa Melanjutkan</h2>
        <p className="text-sm text-ink/60 leading-relaxed mb-5">{message}</p>
        <button onClick={onClose} className="btn-primary w-full">
          Mengerti
        </button>
      </div>
    </div>
  );
}
