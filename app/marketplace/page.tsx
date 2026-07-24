import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { DIGITAL_CATEGORIES, DigitalListing } from "@/lib/types";
import Link from "next/link";
import { Plus, ShoppingBag, Search, Star, CheckCircle2, Eye } from "lucide-react";
import { getMarketplaceListings, searchMarketplaceListings } from "@/lib/cached-queries";
import Pagination from "@/components/Pagination";
import GuestPageGate from "@/components/GuestPageGate";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

// Sama seperti beranda (app/page.tsx): 10 produk per halaman, dan tamu
// (belum login) cuma boleh membuka halaman 1.
const PAGE_SIZE = 10;

// Listing di-cache 15 menit lewat getMarketplaceListings (Next.js Data
// Cache) -- halaman ini tidak lagi query Supabase & tidak lagi pakai
// cookies(), jadi bisa ikut di-cache (ISR) di Vercel per kombinasi kategori.
// cookies() cuma dipanggil (lewat lib/supabase/server) kalau ada yang minta
// halaman ke-2 dst, khusus cek status login tamu -- lihat isGuestBlocked.
export const revalidate = 900;

export default async function MarketplacePage({
  searchParams
}: {
  searchParams: { kategori?: string; q?: string; page?: string };
}) {
  const q = searchParams.q?.trim() || "";
  // getMarketplaceListings/searchMarketplaceListings sengaja throw kalau
  // query gagal (lihat lib/cached-queries.ts) -- ditangkap di sini supaya
  // kegagalan sesaat tidak meng-crash seluruh halaman marketplace. Kalau
  // ada kata kunci pencarian (q), pakai query langsung (tidak di-cache)
  // supaya hasil pencarian selalu akurat.
  const listings = q
    ? await searchMarketplaceListings(q, searchParams.kategori).catch(() => null)
    : await getMarketplaceListings(searchParams.kategori).catch(() => null);

  const pageParam = Number(searchParams.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1;

  let isGuestBlocked = false;
  if (page > 1) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) isGuestBlocked = true;
  }

  const allListings = (listings as DigitalListing[] | null) ?? [];
  const pageListings = allListings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasNext = allListings.length > page * PAGE_SIZE;
  const nextPath = `/marketplace?${searchParams.kategori ? `kategori=${encodeURIComponent(searchParams.kategori)}&` : ""}${
    q ? `q=${encodeURIComponent(q)}&` : ""
  }page=${page}`;

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="section-title">Marketplace Digital</h1>
          <Link href="/marketplace/post" className="btn-primary !px-4 !py-2.5 text-sm gap-1.5">
            <Plus size={16} /> Jual Produk
          </Link>
        </div>
        <p className="text-sm text-ink/55 mb-2">Jual beli akun &amp; produk digital dengan dana ditahan aman platform.</p>
        <span className="badge-escrow mb-4 inline-flex">🔒 Escrow Protection aktif di setiap transaksi</span>

        <form action="/marketplace" method="get" className="relative mb-4">
          {searchParams.kategori && <input type="hidden" name="kategori" value={searchParams.kategori} />}
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Cari produk atau akun digital..."
            className="input !pl-10"
          />
        </form>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4">
          <a
            href={q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace"}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              !searchParams.kategori ? "bg-ink text-white border-transparent" : "bg-white text-ink/70 border-line"
            }`}
          >
            Semua
          </a>
          {DIGITAL_CATEGORIES.map((c) => (
            <a
              key={c.value}
              href={`/marketplace?kategori=${c.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
                searchParams.kategori === c.value ? "bg-ink text-white border-transparent" : "bg-white text-ink/70 border-line"
              }`}
            >
              {c.label}
            </a>
          ))}
        </div>

        {isGuestBlocked ? (
          <GuestPageGate next={nextPath} />
        ) : (
          <>
            {pageListings.length === 0 && (
              <div className="card p-8 text-center text-ink/50">
                <ShoppingBag className="mx-auto mb-3" />
                {q ? `Tidak ada produk yang cocok dengan "${q}".` : "Belum ada produk di kategori ini."}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {pageListings.map((item) => {
                const seller = item.profiles;
                const isTopRated = !!seller && seller.rating_count > 0 && seller.rating_avg >= 4.5;
                const isPopular = (item.view_count ?? 0) >= 20;
                return (
                  <Link
                    key={item.id}
                    href={`/marketplace/${item.id}`}
                    className="card group overflow-hidden block hover:-translate-y-1 hover:shadow-soft transition-all duration-200"
                  >
                    <div className="relative">
                      <img src={item.cover_image} alt={item.title} loading="lazy" decoding="async" className="w-full aspect-square object-cover" />
                      {(item.status === "terjual" || item.stock <= 0) && (
                        <span className="badge-sold absolute top-2 left-2 bg-white/90">Stok Habis</span>
                      )}
                      {isPopular && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold text-turquoise-dark bg-white/90 rounded-pill px-1.5 py-0.5">
                          🔥 Populer
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <p className="text-[11px] font-bold text-turquoise-dark uppercase tracking-wide">
                          {DIGITAL_CATEGORIES.find((c) => c.value === item.category)?.label}
                        </p>
                        {isTopRated && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-gold-dark bg-gold-light rounded-pill px-1.5 py-0.5">
                            <Star size={9} className="fill-current" /> Top
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm text-ink line-clamp-2 mt-0.5">{item.title}</h3>
                      <p className="font-display text-base font-bold text-ink mt-1.5">{formatRupiah(item.price)}</p>
                      {item.status !== "terjual" && item.stock > 0 && item.stock <= 5 && (
                        <p className="text-[11px] font-semibold text-clay mt-0.5">Sisa stok: {item.stock}</p>
                      )}
                      {seller && (
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink/50 flex-wrap">
                          <span className="inline-flex items-center gap-0.5">
                            <Star size={11} className="text-gold-dark fill-gold-dark" />
                            {seller.rating_count > 0 ? seller.rating_avg.toFixed(1) : "Baru"}
                          </span>
                          {seller.completed_jobs_count > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <CheckCircle2 size={11} /> {seller.completed_jobs_count}
                            </span>
                          )}
                          {!!item.view_count && (
                            <span className="inline-flex items-center gap-0.5">
                              <Eye size={11} /> {item.view_count}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            <Pagination
              basePath="/marketplace"
              params={{ kategori: searchParams.kategori, q: q || undefined }}
              currentPage={page}
              hasNext={hasNext}
            />
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
