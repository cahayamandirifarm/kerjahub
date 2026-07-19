"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export default function BannerList({ initialBanners }: { initialBanners: Banner[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [banners, setBanners] = useState(initialBanners);

  async function toggleActive(id: string, current: boolean) {
    setBanners((b) => b.map((x) => (x.id === id ? { ...x, is_active: !current } : x)));
    await supabase.from("banners").update({ is_active: !current }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Hapus banner ini?")) return;
    setBanners((b) => b.filter((x) => x.id !== id));
    await supabase.from("banners").delete().eq("id", id);
    router.refresh();
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = banners.findIndex((b) => b.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= banners.length) return;
    const newBanners = [...banners];
    [newBanners[idx], newBanners[swapIdx]] = [newBanners[swapIdx], newBanners[idx]];
    setBanners(newBanners);
    await Promise.all(newBanners.map((b, i) => supabase.from("banners").update({ sort_order: i }).eq("id", b.id)));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {banners.map((b, i) => (
        <div key={b.id} className="card p-3 flex items-center gap-3">
          <img src={b.image_url} alt="" className="w-20 h-12 object-cover rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{b.title}</p>
            {b.link_url && <p className="text-xs text-ink/40 truncate">{b.link_url}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => move(b.id, -1)} disabled={i === 0} className="text-xs text-ink/40 disabled:opacity-30">
              ↑
            </button>
            <button onClick={() => move(b.id, 1)} disabled={i === banners.length - 1} className="text-xs text-ink/40 disabled:opacity-30">
              ↓
            </button>
            <button
              onClick={() => toggleActive(b.id, b.is_active)}
              className={`w-10 h-5.5 rounded-full transition relative ${b.is_active ? "bg-forest" : "bg-line"}`}
              style={{ width: 40, height: 22 }}
            >
              <span
                className="absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition"
                style={{ width: 18, height: 18, left: b.is_active ? 20 : 2 }}
              />
            </button>
            <button onClick={() => remove(b.id)} className="text-clay">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
