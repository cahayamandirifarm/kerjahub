import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { DIGITAL_CATEGORIES, DigitalListing } from "@/lib/types";
import Link from "next/link";
import { Plus, ShoppingBag } from "lucide-react";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export default async function MarketplacePage({ searchParams }: { searchParams: { kategori?: string } }) {
  const supabase = createClient();
  let query = supabase.from("digital_listings").select("*").eq("status", "aktif").order("created_at", { ascending: false });
  if (searchParams.kategori) query = query.eq("category", searchParams.kategori);
  const { data: listings } = await query;

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-display text-3xl font-semibold">Marketplace Digital</h1>
          <Link href="/marketplace/post" className="btn-primary !px-4 !py-2 text-sm gap-1">
            <Plus size={16} /> Jual Produk
          </Link>
        </div>
        <p className="text-sm text-ink/60 mb-6">Jual beli akun & produk digital dengan dana ditahan aman platform.</p>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4">
          <a
            href="/marketplace"
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border ${
              !searchParams.kategori ? "bg-forest text-paper border-forest" : "bg-white text-ink/70 border-line"
            }`}
          >
            Semua
          </a>
          {DIGITAL_CATEGORIES.map((c) => (
            <a
              key={c.value}
              href={`/marketplace?kategori=${c.value}`}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border ${
                searchParams.kategori === c.value ? "bg-forest text-paper border-forest" : "bg-white text-ink/70 border-line"
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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {(listings as DigitalListing[] | null)?.map((item) => (
            <Link key={item.id} href={`/marketplace/${item.id}`} className="card overflow-hidden block hover:-translate-y-0.5 transition">
              <img src={item.cover_image} alt={item.title} className="w-full aspect-square object-cover" />
              <div className="p-3">
                <p className="text-xs font-semibold text-forest uppercase">
                  {DIGITAL_CATEGORIES.find((c) => c.value === item.category)?.label}
                </p>
                <h3 className="font-semibold text-sm text-ink line-clamp-2 mt-0.5">{item.title}</h3>
                <p className="font-display text-base font-semibold text-gold-dark mt-1">{formatRupiah(item.price)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
