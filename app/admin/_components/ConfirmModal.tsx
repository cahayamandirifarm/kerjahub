"use client";
import { X } from "lucide-react";

/**
 * Modal popup generik untuk aksi admin (konfirmasi, form kecil, dsb).
 * Dipakai untuk mengganti window.confirm() / popover inline supaya semua
 * aksi di admin panel tampil konsisten sebagai popup di tengah layar.
 */
export default function ConfirmModal({
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  confirmVariant = "primary",
  loading = false,
  onConfirm,
  onClose,
  children
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-sm sm:rounded-card rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} disabled={loading} className="text-ink/40 hover:text-ink/70 shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {description && <p className="text-sm text-ink/60">{description}</p>}
          {children}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} disabled={loading} className="btn-secondary flex-1 !px-4 !py-2.5 !text-sm">
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 rounded-pill text-sm font-semibold px-4 py-2.5 transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none text-white ${
                confirmVariant === "danger" ? "bg-clay hover:brightness-105" : "bg-turquoise hover:brightness-105"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
