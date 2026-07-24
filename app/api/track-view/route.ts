import { createPublicClient } from "@/lib/supabase/public";
import { NextResponse } from "next/server";

// Endpoint ini SENGAJA dipanggil dari client (bukan dari server component
// saat render halaman) supaya penambahan view_count tidak menambah beban
// / latency ke request utama yang menampilkan halaman -- penting karena
// compute instance project ini kecil (Nano).
export async function POST(req: Request) {
  try {
    const { type, id } = await req.json();
    if (!id || (type !== "job" && type !== "listing")) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const supabase = createPublicClient();
    const fn = type === "job" ? "increment_job_views" : "increment_listing_views";
    const param = type === "job" ? { p_job_id: id } : { p_listing_id: id };
    // Fire-and-forget di sisi DB -- kegagalan diabaikan, ini bukan data kritikal.
    await supabase.rpc(fn, param);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
