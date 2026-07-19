"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import TopUpModal from "./TopUpModal";
import { useRouter } from "next/navigation";

export default function TopUpButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "btn-gold !px-4 !py-2 text-sm gap-1"}>
        <Plus size={16} /> Top Up
      </button>
      {open && (
        <TopUpModal
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
