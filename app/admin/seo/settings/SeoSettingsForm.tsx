"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SeoSettings } from "@/lib/seo-types";

export default function SeoSettingsForm({ initial }: { initial: SeoSettings | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [siteName, setSiteName] = useState(initial?.site_name || "KerjaHub");
  const [suffix, setSuffix] = useState(initial?.default_meta_title_suffix ?? " | KerjaHub");
  const [defaultDescription, setDefaultDescription] = useState(initial?.default_meta_description || "");
  const [googleVerification, setGoogleVerification] = useState(initial?.google_site_verification || "");
  const [robotsExtra, setRobotsExtra] = useState(initial?.robots_extra_rules || "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    await supabase
      .from("seo_settings")
      .update({
        site_name: siteName.trim() || "KerjaHub",
        default_meta_title_suffix: suffix,
        default_meta_description: defaultDescription.trim() || null,
        google_site_verification: googleVerification.trim() || null,
        robots_extra_rules: robotsExtra.trim() || null
      })
      .eq("id", 1);
    setLoading(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Nama Situs</label>
          <input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        </div>
        <div>
          <label className="label">Akhiran Meta Title Default</label>
          <input className="input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Meta Description Default (fallback kalau landing page tidak mengisi sendiri)</label>
        <textarea className="input min-h-20" value={defaultDescription} onChange={(e) => setDefaultDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Google Site Verification (opsional)</label>
        <input className="input" placeholder="kode dari Google Search Console" value={googleVerification} onChange={(e) => setGoogleVerification(e.target.value)} />
      </div>
      <div>
        <label className="label">Aturan Tambahan robots.txt (opsional, satu baris "Disallow: /path" per baris)</label>
        <textarea className="input min-h-16 font-mono text-xs" value={robotsExtra} onChange={(e) => setRobotsExtra(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
        {saved && <span className="text-sm text-turquoise-dark">Tersimpan.</span>}
      </div>
    </form>
  );
}
