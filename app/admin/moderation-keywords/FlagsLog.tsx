"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, Trash2 } from "lucide-react";

interface Flag {
  id: string;
  source_type: "job" | "listing";
  job_id: string | null;
  listing_id: string | null;
  matched_keyword: string;
  matched_category: string;
  title_snapshot: string;
  reviewed: boolean;
  created_at: string;
  owner: { id: string; full_name: string; username: string } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function FlagsLog({ initialFlags }: { initialFlags: Flag[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [flags, setFlags] = useState(initialFlags);

  async function markReviewed(id: string) {
    setFlags((list) => list.map((f) => (f.id === id ? { ...f, reviewed: true } : f)));
    await supabase.from("moderation_flags").update({ reviewed: true }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus catatan log ini?")) return;
    setFlags((list) => list.filter((f) => f.id !== id));
    await supabase.from("moderation_flags").delete().eq("id", id);
    router.refresh();
  }

  if (flags.length === 0) {
    return <div className="card p-6 text-center text-ink/50 text-sm">Belum ada postingan yang terkena filter.</div>;
  }

  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.id} className={`card p-3 flex items-start gap-3 ${f.reviewed ? "opacity-50" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{f.title_snapshot}</p>
            <p className="text-xs text-ink/50 mt-0.5">
              {f.source_type === "job" ? "Job/Jasa" : "Produk Marketplace"} &middot; kata kunci &quot;{f.matched_keyword}&quot;
              &middot; {f.owner ? `@${f.owner.username}` : "pengguna tidak ditemukan"} &middot; {formatDate(f.created_at)}
            </p>
            {(f.job_id || f.listing_id) && (
              <Link
                href={f.source_type === "job" ? `/jobs/${f.job_id}` : `/marketplace/${f.listing_id}`}
                target="_blank"
                className="text-xs font-semibold text-turquoise"
              >
                Lihat postingan &rarr;
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!f.reviewed && (
              <button onClick={() => markReviewed(f.id)} className="text-xs font-semibold text-turquoise flex items-center gap-1">
                <Check size={13} /> Tandai Ditinjau
              </button>
            )}
            <button onClick={() => remove(f.id)} className="text-clay p-1">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
