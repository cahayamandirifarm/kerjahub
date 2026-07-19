import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";
import { notFound } from "next/navigation";
import { DIGITAL_CATEGORIES } from "@/lib/types";
import BuyButton from "./BuyButton";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export default async function DigitalListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("digital_listings")
    .select("*, profiles!digital_listings_seller_id_fkey(full_name, rating_avg, rating_count)")
    .eq("id", params.id)
    .single();

  if (!listing) notFound();
  const seller = (listing as any).profiles;
  const images = [listing.cover_image, ...(listing.gallery_images || [])];

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {images.map((img: string, i: number) => (
            <img key={i} src={img} alt="" className={`rounded-lg object-cover ${i === 0 ? "col-span-4 aspect-video" : "aspect-square"}`} />
          ))}
        </div>

        <span className="text-xs font-semibold text-forest uppercase">
          {DIGITAL_CATEGORIES.find((c) => c.value === listing.category)?.label}
        </span>
        <h1 className="font-display text-2xl font-semibold mt-1">{listing.title}</h1>
        <p className="font-display text-3xl font-semibold text-gold-dark mt-2">{formatRupiah(listing.price)}</p>

        <div className="card p-5 mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">Deskripsi</h2>
          <p className="text-ink/70 whitespace-pre-line">{listing.description}</p>
        </div>

        {seller && (
          <div className="card p-4 mt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-forest-light flex items-center justify-center font-display font-semibold text-forest-dark">
              {seller.full_name?.[0] ?? "?"}
            </div>
            <div>
              <p className="font-semibold text-ink">{seller.full_name}</p>
              <p className="text-xs text-ink/50">
                ★ {seller.rating_avg?.toFixed(1) ?? "0.0"} ({seller.rating_count} ulasan)
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <BuyButton listingId={listing.id} status={listing.status} />
        </div>
      </div>
    </div>
  );
}
