"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageCircle } from "lucide-react";

type Props = {
  kind: "job" | "listing";
  refId: string;
  ownerId: string;
  label?: string;
};

/**
 * Tombol "Chat Dulu" — memicu RPC start_job_chat / start_listing_chat untuk
 * membuat (atau membuka kembali) percakapan pra-deal antara pengunjung dan
 * pemilik postingan, SEBELUM melamar/mengajak kerja sama/membuat order.
 * Disembunyikan otomatis kalau yang melihat adalah pemilik postingan sendiri.
 */
export default function ChatInquiryButton({ kind, refId, ownerId, label }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setIsOwner(!!user && user.id === ownerId);
      setChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick() {
    setError(null);
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      const next = kind === "job" ? `/jobs/${refId}` : `/marketplace/${refId}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    setLoading(true);
    const rpcName = kind === "job" ? "start_job_chat" : "start_listing_chat";
    const rpcArg = kind === "job" ? { p_job_id: refId } : { p_listing_id: refId };
    const { data, error: rpcError } = await supabase.rpc(rpcName, rpcArg);
    setLoading(false);

    if (rpcError || !data) {
      setError("Gagal membuka chat, coba lagi.");
      return;
    }
    router.push(`/chat/${data}`);
  }

  // Sembunyikan tombol sebelum status kepemilikan diketahui, atau kalau ini postingan sendiri
  if (!checked || isOwner) return null;

  const defaultLabel = kind === "job" ? "Tanya Dulu Sebelum Melamar" : "Tanya Ketersediaan ke Penjual";

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn-secondary w-full inline-flex items-center justify-center gap-2"
      >
        <MessageCircle size={17} />
        {loading ? "Membuka chat..." : label || defaultLabel}
      </button>
      {error && <p className="text-sm text-clay mt-2 text-center">{error}</p>}
    </div>
  );
}
