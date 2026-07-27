import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import Navbar from "@/components/Navbar";
import { notFound } from "next/navigation";
import { DIGITAL_CATEGORIES } from "@/lib/types";
import BuyButton from "./BuyButton";
import ChatInquiryButton from "@/components/ChatInquiryButton";
import WhatsAppInquiryButton from "@/components/WhatsAppInquiryButton";
import Link from "next/link";
import { CheckCircle2, Eye } from "lucide-react";
import ViewTracker from "@/components/ViewTracker";
import JsonLd from "@/components/seo/JsonLd";
import { absoluteUrl, stripHtml } from "@/lib/seo-helpers";

function formatRupiah(n: number) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

// SEO -- TIDAK mengubah query/tampilan/fungsi apa pun di bawah, cuma
// menambah <head> metadata + JSON-LD. Semua field diturunkan langsung dari
// kolom yang SUDAH ADA (title, description, category, price) -- tidak
// perlu kolom baru, tidak perlu penjual isi apa pun secara manual, jadi
// alur posting listing yang sudah ada di ListingForm SAMA SEKALI tidak
// tersentuh.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data: listing } = await supabase
    .from("digital_listings")
    .select("title, description, price, cover_image, category")
    .eq("id", params.id)
    .single();

  if (!listing) return { title: "Produk tidak ditemukan" };

  const categoryLabel = DIGITAL_CATEGORIES.find((c) => c.value === listing.category)?.label || "";
  const title = `${listing.title} — ${formatRupiah(listing.price)} | KerjaHub Marketplace`;
  const description = stripHtml(listing.description, 155) || `${categoryLabel} tersedia di KerjaHub Marketplace.`;
  const canonical = absoluteUrl(`/marketplace/${params.id}`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: listing.title,
      description,
      url: canonical,
      type: "website",
      images: listing.cover_image ? [{ url: listing.cover_image }] : undefined
    },
    twitter: {
      card: listing.cover_image ? "summary_large_image" : "summary",
      title: listing.title,
      description,
      images: listing.cover_image ? [listing.cover_image] : undefined
    }
  };
}

export default async function DigitalListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("digital_listings")
    .select("*, profiles!digital_listings_seller_id_fkey(id, full_name, phone, rating_avg, rating_count, completed_jobs_count)")
    .eq("id", params.id)
    .single();

  if (!listing) notFound();

  const seller = (listing as any).profiles;
  const images = [listing.cover_image, ...(listing.gallery_images || [])];

  const categoryLabel = DIGITAL_CATEGORIES.find((c) => c.value === listing.category)?.label || "";
  const canonical = absoluteUrl(`/marketplace/${listing.id}`);
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: listing.title,
        description: stripHtml(listing.description, 300),
        image: images.filter(Boolean),
        category: categoryLabel,
        offers: { "@type": "Offer", price: listing.price, priceCurrency: "IDR", availability: listing.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Beranda", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Marketplace", item: absoluteUrl("/marketplace") },
          { "@type": "ListItem", position: 3, name: listing.title, item: canonical }
        ]
      }
    ]
  };

  return (
    <div className="min-h-screen pb-16">
      <JsonLd data={schema} />
      <ViewTracker type="listing" id={listing.id} />
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {images.map((img: string, i: number) => (
            <img key={i} src={img} alt="" className={`rounded-lg object-cover ${i === 0 ? "col-span-4 aspect-video" : "aspect-square"}`} />
          ))}
        </div>

        <span className="text-xs font-semibold text-turquoise uppercase">
          {DIGITAL_CATEGORIES.find((c) => c.value === listing.category)?.label}
        </span>
        <h1 className="font-display text-2xl font-semibold mt-1">{listing.title}</h1>
        <p className="font-display text-3xl font-semibold text-gold-dark mt-2">{formatRupiah(listing.price)}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {!!listing.view_count && (
            <p className="text-xs text-ink/45 inline-flex items-center gap-1">
              <Eye size={13} /> {listing.view_count}x dilihat
            </p>
          )}
          <p className={`text-xs font-semibold ${listing.stock > 0 ? "text-ink/50" : "text-clay"}`}>
            {listing.stock > 0 ? `Stok tersisa: ${listing.stock}` : "Stok habis"}
          </p>
        </div>

        <div className="card p-5 mt-4">
          <h2 className="font-display text-lg font-semibold mb-2">Deskripsi</h2>
          <p className="text-ink/70 whitespace-pre-line">{listing.description}</p>
        </div>

        {seller && (
          <Link
            href={`/profil/${seller.id}`}
            className="card p-4 mt-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-soft transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-full bg-turquoise-light flex items-center justify-center font-display font-semibold text-turquoise-dark shrink-0">
              {seller.full_name?.[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink">{seller.full_name}</p>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs text-ink/50">
                  ★ {seller.rating_avg?.toFixed(1) ?? "0.0"} ({seller.rating_count} ulasan)
                </p>
                {seller.completed_jobs_count > 0 && (
                  <p className="text-xs text-ink/50 inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> {seller.completed_jobs_count} selesai
                  </p>
                )}
              </div>
              <p className="text-xs font-semibold text-turquoise-dark mt-0.5">Lihat profil &amp; produk lain →</p>
            </div>
          </Link>
        )}

        <div className="mt-6 space-y-3">
          <ChatInquiryButton kind="listing" refId={listing.id} ownerId={listing.seller_id} />
          <WhatsAppInquiryButton
            kind="listing"
            refId={listing.id}
            ownerId={listing.seller_id}
            ownerPhone={seller?.phone}
            title={listing.title}
            priceLabel={formatRupiah(listing.price)}
          />
          <BuyButton listingId={listing.id} status={listing.status} stock={listing.stock} ownerId={listing.seller_id} />
        </div>
      </div>
    </div>
  );
}
