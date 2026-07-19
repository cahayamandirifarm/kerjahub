import { createClient } from "@/lib/supabase/server";
import ListingStatusButtons from "./ListingStatusButtons";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function AdminMarketplaceListingsPage() {
  const supabase = createClient();
  const { data: listings } = await supabase
    .from("digital_listings")
    .select("*, profiles!digital_listings_seller_id_fkey(full_name)")
    .neq("status", "dihapus")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Kelola Listing Marketplace Digital</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink/50 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Produk</th>
              <th className="text-left px-4 py-3">Penjual</th>
              <th className="text-left px-4 py-3">Harga</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {listings?.map((l: any) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium max-w-xs truncate">{l.title}</td>
                <td className="px-4 py-3">{l.profiles?.full_name}</td>
                <td className="px-4 py-3">{formatRupiah(l.price)}</td>
                <td className="px-4 py-3 capitalize">{l.status}</td>
                <td className="px-4 py-3">
                  <ListingStatusButtons listingId={l.id} status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
