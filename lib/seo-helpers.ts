import type { SeoFaq, SeoLandingPage, SeoSettings } from "@/lib/seo-types";

// Dipakai di admin form: judul "Jasa Antar Jemput Bandung!" -> slug
// "jasa-antar-jemput-bandung". Admin tetap bisa timpa manual sesudahnya.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // buang aksen
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Ambil teks polos dari HTML hasil rich text editor -- dipakai buat
// fallback meta description & schema kalau admin tidak isi manual.
export function stripHtml(html: string, maxLength = 160): string {
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://kerjahub.info";
  if (path.startsWith("http")) return path;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function resolveMetaTitle(lp: SeoLandingPage, settings: SeoSettings | null): string {
  const base = lp.meta_title?.trim() || lp.title;
  const suffix = settings?.default_meta_title_suffix || "";
  // Kalau admin sudah masukkan nama brand sendiri di meta_title, jangan
  // ditempel dobel.
  if (suffix && base.toLowerCase().includes(suffix.replace(/[|,-]/g, "").trim().toLowerCase())) {
    return base;
  }
  return `${base}${suffix}`;
}

export function resolveMetaDescription(lp: SeoLandingPage, settings: SeoSettings | null): string {
  if (lp.meta_description?.trim()) return lp.meta_description.trim();
  if (lp.hero_description?.trim()) return lp.hero_description.trim().slice(0, 160);
  if (lp.content) return stripHtml(lp.content);
  return settings?.default_meta_description || `${lp.title} — tersedia di KerjaHub.`;
}

// Bangun JSON-LD gabungan (Organization + WebSite + Breadcrumb + Service +
// FAQPage) otomatis dari field landing page. Kalau admin sudah isi
// schema_json manual, itu dipakai APA ADANYA (lihat pemanggilnya di
// app/[slug]/page.tsx) -- fungsi ini cuma dipanggil sebagai fallback.
export function buildAutoSchema(lp: SeoLandingPage, faqs: SeoFaq[], settings: SeoSettings | null) {
  const url = absoluteUrl(`/${lp.slug}`);
  const siteName = settings?.site_name || "KerjaHub";
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: lp.meta_title || lp.title,
      description: resolveMetaDescription(lp, settings),
      inLanguage: "id-ID"
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Beranda", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: lp.h1 || lp.title, item: url }
      ]
    },
    {
      "@type": "Service",
      name: lp.h1 || lp.title,
      description: resolveMetaDescription(lp, settings),
      url,
      provider: { "@type": "Organization", name: siteName, url: absoluteUrl("/") }
    }
  ];

  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer }
      }))
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
