import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fitur BONUS ("Generate AI SEO" di form admin). Butuh env var
// ANTHROPIC_API_KEY di server (Vercel -> Project Settings -> Environment
// Variables) -- TIDAK boleh diekspos ke client (makanya lewat API route
// ini, bukan dipanggil langsung dari browser). Kalau belum diset, endpoint
// ini mengembalikan pesan error yang jelas, dan tombol di form tetap aman
// dipakai (fitur lain di halaman tidak terganggu).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Tidak berhak" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Tidak berhak" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY belum diset di server -- fitur Generate AI SEO belum aktif." },
      { status: 501 }
    );
  }

  const { title, category, location } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title wajib diisi" }, { status: 400 });

  const context = [category && `Kategori: ${category}`, location && `Daerah: ${location}`].filter(Boolean).join(", ");

  const prompt = `Kamu membantu tim SEO KerjaHub (platform jasa & marketplace freelance Indonesia) membuat landing page SEO untuk:
Judul: "${title}"${context ? `\n${context}` : ""}

Balas HANYA dengan JSON valid (tanpa markdown/backtick), persis struktur ini:
{
  "meta_title": "maks 60 karakter, mengandung kata kunci utama",
  "meta_description": "maks 155 karakter, ajakan bertindak, mengandung kata kunci",
  "meta_keywords": "5-8 kata kunci dipisah koma",
  "h1": "judul H1 yang menarik, mengandung kata kunci utama",
  "hero_title": "sub-judul singkat pelengkap H1",
  "hero_description": "1-2 kalimat penjelasan singkat",
  "content_outline": "draft konten HTML sederhana (pakai tag <h2>,<p>,<ul><li>) sekitar 3-4 bagian menjelaskan layanan ini, manfaatnya, dan kenapa pakai KerjaHub -- dalam Bahasa Indonesia natural, BUKAN keyword stuffing",
  "faqs": [{"question": "...", "answer": "..."}, ... (3-5 item, pertanyaan yang benar-benar sering dicari orang soal topik ini)]
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Anthropic API error:", res.status, body);
      return NextResponse.json({ error: "Gagal menghubungi layanan AI." }, { status: 502 });
    }

    const data = await res.json();
    const text = (data.content || [])
      .map((block: any) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Generate AI SEO error:", err);
    return NextResponse.json({ error: "Gagal memproses hasil AI. Coba lagi." }, { status: 500 });
  }
}
