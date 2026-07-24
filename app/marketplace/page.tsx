import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { DIGITAL_CATEGORIES, DigitalListing } from "@/lib/types";
import Link from "next/link";
import { Plus, ShoppingBag, Star, CheckCircle2, Eye } from "lucide-react";
import { getMarketplaceListings } from "@/lib/cached-queries";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

// Listing di-cache 15 menit lewat getMarketplaceListings (Next.js Data
// Cache) -- halaman ini tidak lagi query Supabase & tidak lagi pakai
// cookies(), jadi bisa ikut di-cache (ISR) di Vercel per kombinasi kategori.
export const revalidate = 900;

export default async function MarketplacePage({ searchParams }: { searchParams: { kategori?: string } }) {
  // getMarketplaceListings sengaja throw kalau query gagal (lihat
  // lib/cached-queries.ts) -- ditangkap di sini supaya kegagalan sesaat
  // tidak meng-crash seluruh halaman marketplace.
  const listings = await getMarketplaceListings(searchParams.kategori).catch(() => null);

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
        <span className="badge-escrow mb-6 inline-flex">🔒 Escrow Protection aktif di setiap transaksi</span>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4">
          <a
            href="/marketplace"
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
              !searchParams.kategori ? "bg-ink text-white border-transparent" : "bg-white text-ink/70 border-line"
            }`}
          >
            Semua
          </a>
          {DIGITAL_CATEGORIES.map((c) => (
            <a
              key={c.value}
              href={`/marketplace?kategori=${c.value}`}
              className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold border transition-colors ${
                searchParams.kategori === c.value ? "bg-ink text-white border-transparent" : "bg-white text-ink/70 border-line"
              }`}
            >
              {c.label}
            </a>
          ))}
        </div>

        {(!listings || listings.length === 0) && (
          <div className="card p-8 text-center text-ink/50">
            <ShoppingBag className="mx-auto mb-3" />
            Belum ada produk di kategori ini.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {(listings as DigitalListing[] | null)?.map((item) => {
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
                  {item.status === "terjual" && (
                    <span className="badge-sold absolute top-2 left-2 bg-white/90">Terjual</span>
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
      </div>
      <BottomNav />
    </div>
  );
}
