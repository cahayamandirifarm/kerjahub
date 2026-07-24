import { NextRequest, NextResponse } from "next/server";
import { getHomeJobsMarker } from "@/lib/cached-queries";

// Dipanggil lewat polling ringan dari components/JobsAutoRefresh.tsx (client)
// untuk cek apakah daftar postingan di beranda ada yang berubah (postingan
// baru ATAU postingan lama yang diupdate/repost/nonaktif), TANPA menarik
// seluruh daftar job. Publik, tidak baca cookies -- supaya bisa ikut
// di-cache (lihat getHomeJobsMarker, revalidate 20 detik + tag "jobs-list").
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipeParam = searchParams.get("tipe");
  const tipe = tipeParam === "worker" ? "worker" : "employer";
  const kategori = searchParams.get("kategori") || undefined;

  const marker = await getHomeJobsMarker(tipe, kategori).catch(() => null);

  if (!marker) {
    return NextResponse.json({ latestPostId: null, latestPostAt: null, latestUpdateId: null, latestUpdateAt: null });
  }

  return NextResponse.json(marker);
}
