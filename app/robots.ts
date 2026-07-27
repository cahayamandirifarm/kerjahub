import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { absoluteUrl } from "@/lib/seo-helpers";

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const supabase = createPublicClient();
  const { data: settings } = await supabase.from("seo_settings").select("robots_extra_rules").eq("id", 1).single();

  const disallow = ["/admin", "/admin-login", "/dashboard", "/api", "/chat", "/kyc", "/notifications"];

  // SEO Settings admin bisa isi baris tambahan bebas format
  // "Disallow: /path-tertentu" (satu per baris) -- baris lain diabaikan.
  if (settings?.robots_extra_rules) {
    for (const line of settings.robots_extra_rules.split("\n")) {
      const match = line.trim().match(/^Disallow:\s*(\/\S*)/i);
      if (match) disallow.push(match[1]);
    }
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/")
  };
}
