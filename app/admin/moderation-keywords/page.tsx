import { createClient } from "@/lib/supabase/server";
import KeywordForm from "./KeywordForm";
import KeywordList from "./KeywordList";
import FlagsLog from "./FlagsLog";

export default async function AdminModerationKeywordsPage() {
  const supabase = createClient();

  const [{ data: keywords }, { data: flags }] = await Promise.all([
    supabase.from("moderation_keywords").select("*").order("category", { ascending: true }).order("keyword", { ascending: true }),
    supabase
      .from("moderation_flags")
      .select("*, owner:profiles!moderation_flags_owner_id_fkey(id, full_name, username)")
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Filter Kata Postingan</h1>
      <p className="text-sm text-ink/60 mb-6">
        Kata kunci di bawah dicek otomatis terhadap judul &amp; deskripsi setiap postingan job/jasa dan produk
        marketplace. Postingan baru yang cocok akan ditolak saat disimpan; postingan lama yang cocok langsung
        disembunyikan otomatis. Filter ini berbasis kecocokan kata sederhana (bukan AI), jadi sesekali cek log di
        bawah untuk kemungkinan salah tangkap.
      </p>

      <KeywordForm />
      <KeywordList initialKeywords={keywords || []} />

      <h2 className="font-display text-lg font-semibold mt-10 mb-1">Log Postingan Terkena Filter</h2>
      <p className="text-sm text-ink/60 mb-4">
        100 kejadian terbaru. Kalau ternyata salah tangkap (postingan sah), hubungi pemiliknya lalu aktifkan
        kembali postingannya lewat menu Postingan Kerja / Listing Marketplace, dan pertimbangkan menonaktifkan
        kata kunci yang terlalu luas di atas.
      </p>
      <FlagsLog initialFlags={flags || []} />
    </div>
  );
}
