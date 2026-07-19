import { createClient } from "@/lib/supabase/server";
import BannerForm from "./BannerForm";
import BannerList from "./BannerList";

export default async function AdminBannersPage() {
  const supabase = createClient();
  const { data: banners } = await supabase.from("banners").select("*").order("sort_order", { ascending: true });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Banner Slide Beranda</h1>
      <p className="text-sm text-ink/60 mb-6">Banner tampil sebagai carousel otomatis di halaman utama.</p>
      <BannerForm />
      <BannerList initialBanners={banners || []} />
    </div>
  );
}
