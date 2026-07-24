import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import ListingForm from "@/components/ListingForm";

export default async function EditListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketplace/${params.id}/edit`);

  const { data: listing } = await supabase.from("digital_listings").select("*").eq("id", params.id).single();
  if (!listing) notFound();

  if (listing.seller_id !== user.id) redirect("/marketplace");

  if (listing.status === "terjual" || listing.status === "dihapus") {
    return (
      <div className="min-h-screen py-16 px-4">
        <div className="max-w-lg mx-auto card p-6 text-center text-sm text-ink/60">
          Produk ini berstatus "{listing.status}" sehingga tidak bisa diedit lagi.
        </div>
      </div>
    );
  }

  return (
    <ListingForm
      listingId={listing.id}
      initial={{
        category: listing.category,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        stock: listing.stock,
        cover_image: listing.cover_image,
        gallery_images: listing.gallery_images || []
      }}
    />
  );
}
