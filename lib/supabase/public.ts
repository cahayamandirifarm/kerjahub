import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase TANPA cookies/session -- khusus untuk query publik &
// read-only yang boleh di-cache lewat unstable_cache (lib/cached-queries.ts).
// next/headers cookies() tidak boleh dipanggil di dalam fungsi yang di-wrap
// unstable_cache, jadi query yang mau di-cache harus pakai client ini, BUKAN
// lib/supabase/server.ts (yang selalu baca cookies dan membuat halaman
// otomatis dynamic/tidak bisa di-cache).
//
// Aman dipakai hanya untuk data yang memang publik & tunduk RLS "boleh
// dibaca semua orang" (postingan kerja terbuka, listing marketplace aktif,
// banner, pengaturan platform). JANGAN pernah pakai untuk data yang butuh
// auth.uid() (saldo, chat, escrow, dll).
export function createPublicClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }
  });
}
