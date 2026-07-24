"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { swrFetch } from "@/lib/client-cache";
import { Megaphone } from "lucide-react";

export default function SiteBanner() {
  const supabase = createClient();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    swrFetch<string | null>(
      "settings:site_banner_text",
      24 * 60 * 60 * 1000,
      async () => {
        const { data } = await supabase.from("platform_settings").select("value").eq("key", "site_banner_text").single();
        return data?.value ?? null;
      },
      (value) => setText(value),
      "local"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!text) return null;

  return (
    <div className="bg-gold-light border-b border-gold/30">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-2 text-sm text-gold-dark font-medium">
        <Megaphone size={15} className="shrink-0" />
        <span>{text}</span>
      </div>
    </div>
  );
}
