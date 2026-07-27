"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";
import type { SeoRedirect } from "@/lib/seo-types";

export default function RedirectList({ initialRedirects }: { initialRedirects: SeoRedirect[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [redirects, setRedirects] = useState(initialRedirects);

  async function remove(id: string) {
    if (!confirm("Hapus redirect ini?")) return;
    setRedirects((r) => r.filter((x) => x.id !== id));
    await supabase.from("seo_redirects").delete().eq("id", id);
    router.refresh();
  }

  if (!redirects.length) {
    return <div className="card p-8 text-center text-sm text-ink/50">Belum ada redirect.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink/40 border-b border-line">
            <th className="px-4 py-3 font-medium">Dari</th>
            <th className="px-4 py-3 font-medium">Ke</th>
            <th className="px-4 py-3 font-medium">Tipe</th>
            <th className="px-4 py-3 font-medium text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {redirects.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{r.from_path}</td>
              <td className="px-4 py-3 font-mono text-xs text-ink/60">{r.to_path}</td>
              <td className="px-4 py-3 text-xs text-ink/60">{r.status_code}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => remove(r.id)} className="p-1.5 rounded-md text-clay/70 hover:bg-clay/10 hover:text-clay">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
