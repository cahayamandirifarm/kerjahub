import { createClient } from "@/lib/supabase/server";
import RedirectForm from "./RedirectForm";
import RedirectList from "./RedirectList";

export default async function AdminSeoRedirectPage() {
  const supabase = createClient();
  const { data: redirects } = await supabase.from("seo_redirects").select("*").order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">SEO — Redirect</h1>
      <p className="text-sm text-ink/60 mb-6">
        Alihkan URL lama (mis. slug landing page yang dihapus/diganti) supaya pengunjung & Google tidak dapat halaman 404.
      </p>
      <RedirectForm />
      <RedirectList initialRedirects={redirects || []} />
    </div>
  );
}
