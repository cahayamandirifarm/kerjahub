import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";

export default async function AdminSettingsPage() {
  const supabase = createClient();
  const { data: settings } = await supabase.from("platform_settings").select("*").order("key");

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Pengaturan Website</h1>
      <p className="text-sm text-ink/60 mb-6">
        Perubahan di sini berlaku langsung ke seluruh aplikasi tanpa perlu deploy ulang.
      </p>
      <SettingsForm initialSettings={settings || []} />
    </div>
  );
}
