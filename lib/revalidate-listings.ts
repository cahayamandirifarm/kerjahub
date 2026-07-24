// Panggil ini di client setelah berhasil create/update/delete/toggle status
// job atau digital_listing, supaya cache beranda & marketplace
// (lib/cached-queries.ts) langsung di-invalidate lewat
// app/api/revalidate-listings, bukan menunggu revalidate otomatis (30 menit).
//
// Sengaja "best-effort": kalau gagal (mis. offline), tidak melempar error --
// mutasi utamanya (insert/update/delete ke Supabase) sudah berhasil duluan,
// jangan sampai kegagalan revalidate bikin UI menampilkan error palsu ke
// user. Cache tetap akan pulih sendiri lewat revalidate 1800 detik.
export function revalidateListings() {
  fetch("/api/revalidate-listings", { method: "POST" }).catch(() => {});
}
