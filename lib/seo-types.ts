export interface SeoCategory {
  id: string;
  name: string;
  slug: string;
  job_category_match?: string[];
  keyword_match?: string[];
  remote_service?: boolean;
}

export interface SeoLocation {
  id: string;
  name: string;
  slug: string;
}

export interface SeoFaq {
  id: string;
  landing_page_id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export type SeoLandingStatus = "draft" | "published";

export interface SeoLandingPage {
  id: string;
  title: string;
  slug: string;
  h1: string;
  hero_title: string | null;
  hero_description: string | null;
  content: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  canonical_url: string | null;
  og_image: string | null;
  schema_json: Record<string, unknown> | null;
  category_id: string | null;
  location_id: string | null;
  featured: boolean;
  cta_text: string | null;
  cta_link: string | null;
  related_ids: string[];
  status: SeoLandingStatus;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
  // Diisi lewat join saat query (bukan kolom asli tabel)
  category?: SeoCategory | null;
  location?: SeoLocation | null;
  faqs?: SeoFaq[];
}

export interface SeoRedirect {
  id: string;
  from_path: string;
  to_path: string;
  status_code: 301 | 302;
  created_at: string;
}

export interface SeoSettings {
  id: number;
  site_name: string;
  default_meta_title_suffix: string;
  default_meta_description: string | null;
  default_og_image: string | null;
  google_site_verification: string | null;
  robots_extra_rules: string | null;
}
