"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/seo-helpers";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { Plus, Trash2, Sparkles, Eye, ExternalLink } from "lucide-react";
import type { SeoFaq, SeoLandingPage } from "@/lib/seo-types";

interface Option {
  id: string;
  name: string;
}
interface RelatedOption {
  id: string;
  title: string;
}

type FaqDraft = { id?: string; question: string; answer: string };

export default function LandingPageForm({
  initial,
  initialFaqs,
  categories,
  locations,
  relatedOptions
}: {
  initial?: SeoLandingPage | null;
  initialFaqs?: SeoFaq[];
  categories: Option[];
  locations: Option[];
  relatedOptions: RelatedOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [h1, setH1] = useState(initial?.h1 || "");
  const [heroTitle, setHeroTitle] = useState(initial?.hero_title || "");
  const [heroDescription, setHeroDescription] = useState(initial?.hero_description || "");
  const [content, setContent] = useState(initial?.content || "");
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title || "");
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description || "");
  const [metaKeywords, setMetaKeywords] = useState(initial?.meta_keywords || "");
  const [canonicalUrl, setCanonicalUrl] = useState(initial?.canonical_url || "");
  const [ogImage, setOgImage] = useState(initial?.og_image || "");
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [schemaJson, setSchemaJson] = useState(initial?.schema_json ? JSON.stringify(initial.schema_json, null, 2) : "");
  const [categoryId, setCategoryId] = useState(initial?.category_id || "");
  const [locationId, setLocationId] = useState(initial?.location_id || "");
  const [featured, setFeatured] = useState(initial?.featured || false);
  const [ctaText, setCtaText] = useState(initial?.cta_text || "");
  const [ctaLink, setCtaLink] = useState(initial?.cta_link || "");
  const [relatedIds, setRelatedIds] = useState<string[]>(initial?.related_ids || []);
  const [status, setStatus] = useState<"draft" | "published">(initial?.status || "draft");
  const [publishDate, setPublishDate] = useState(initial?.publish_date ? initial.publish_date.slice(0, 16) : "");
  const [faqs, setFaqs] = useState<FaqDraft[]>(initialFaqs?.length ? initialFaqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })) : []);

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function addFaq() {
    setFaqs((f) => [...f, { question: "", answer: "" }]);
  }
  function updateFaq(idx: number, patch: Partial<FaqDraft>) {
    setFaqs((f) => f.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function removeFaq(idx: number) {
    setFaqs((f) => f.filter((_, i) => i !== idx));
  }

  function toggleRelated(id: string) {
    setRelatedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 6 ? ids : [...ids, id]));
  }

  async function handleAiGenerate() {
    if (!title.trim()) {
      setError("Isi Title dulu sebelum generate AI SEO.");
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      const categoryName = categories.find((c) => c.id === categoryId)?.name;
      const locationName = locations.find((l) => l.id === locationId)?.name;
      const res = await fetch("/api/admin/seo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category: categoryName, location: locationName })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Gagal generate AI SEO.");
      }
      const suggestion = await res.json();
      if (suggestion.meta_title) setMetaTitle(suggestion.meta_title);
      if (suggestion.meta_description) setMetaDescription(suggestion.meta_description);
      if (suggestion.meta_keywords) setMetaKeywords(suggestion.meta_keywords);
      if (suggestion.h1 && !h1) setH1(suggestion.h1);
      if (suggestion.hero_title && !heroTitle) setHeroTitle(suggestion.hero_title);
      if (suggestion.hero_description && !heroDescription) setHeroDescription(suggestion.hero_description);
      if (Array.isArray(suggestion.faqs) && suggestion.faqs.length && faqs.length === 0) {
        setFaqs(suggestion.faqs.map((f: any) => ({ question: f.question, answer: f.answer })));
      }
      if (suggestion.content_outline && !content) {
        setContent(suggestion.content_outline);
      }
    } catch (err: any) {
      setError(err.message || "Gagal generate AI SEO.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !slug.trim() || !h1.trim()) {
      setError("Title, Slug, dan H1 wajib diisi.");
      return;
    }

    let parsedSchema: Record<string, unknown> | null = null;
    if (schemaJson.trim()) {
      try {
        parsedSchema = JSON.parse(schemaJson);
      } catch {
        setError("Schema JSON tidak valid -- cek format JSON-nya.");
        return;
      }
    }

    setLoading(true);
    try {
      let finalOgImage = ogImage;
      if (ogImageFile) {
        const path = `og/${Date.now()}-${ogImageFile.name}`;
        const { error: uploadError } = await supabase.storage.from("seo-og-images").upload(path, ogImageFile);
        if (uploadError) throw new Error("Gagal unggah OG image.");
        finalOgImage = supabase.storage.from("seo-og-images").getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        title: title.trim(),
        slug: slugify(slug),
        h1: h1.trim(),
        hero_title: heroTitle.trim() || null,
        hero_description: heroDescription.trim() || null,
        content: content || null,
        meta_title: metaTitle.trim() || null,
        meta_description: metaDescription.trim() || null,
        meta_keywords: metaKeywords.trim() || null,
        canonical_url: canonicalUrl.trim() || null,
        og_image: finalOgImage || null,
        schema_json: parsedSchema,
        category_id: categoryId || null,
        location_id: locationId || null,
        featured,
        cta_text: ctaText.trim() || null,
        cta_link: ctaLink.trim() || null,
        related_ids: relatedIds,
        status,
        publish_date: publishDate ? new Date(publishDate).toISOString() : null
      };

      let landingPageId = initial?.id;
      if (isEdit && landingPageId) {
        const { error: updateError } = await supabase.from("seo_landing_pages").update(payload).eq("id", landingPageId);
        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase.from("seo_landing_pages").insert(payload).select("id").single();
        if (insertError) throw insertError;
        landingPageId = inserted!.id;
      }

      // FAQ: hapus semua punya landing page ini, insert ulang -- lebih
      // simpel & aman daripada diff per baris, dan jumlah FAQ per halaman
      // biasanya kecil (belasan).
      await supabase.from("seo_faqs").delete().eq("landing_page_id", landingPageId!);
      const validFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim());
      if (validFaqs.length) {
        await supabase.from("seo_faqs").insert(
          validFaqs.map((f, i) => ({
            landing_page_id: landingPageId!,
            question: f.question.trim(),
            answer: f.answer.trim(),
            sort_order: i
          }))
        );
      }

      router.push("/admin/seo/landing-pages");
      router.refresh();
    } catch (err: any) {
      if (err?.code === "23505" || err?.message?.toLowerCase().includes("duplicate")) {
        setError(`Slug "/${slug}" sudah dipakai landing page lain -- pilih slug lain.`);
      } else {
        setError(err?.message || "Gagal menyimpan landing page.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-20">
      {error && <div className="card p-3 text-sm text-clay border-clay/30">{error}</div>}

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-ink">Konten Utama</h2>
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={aiLoading}
            className="btn-secondary !py-1.5 text-xs inline-flex items-center gap-1.5"
          >
            <Sparkles size={14} /> {aiLoading ? "Membuat..." : "Generate AI SEO"}
          </button>
        </div>

        <div>
          <label className="label">Title</label>
          <input className="input" required value={title} onChange={(e) => handleTitleChange(e.target.value)} />
        </div>
        <div>
          <label className="label">Slug</label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ink/40 shrink-0">/</span>
            <input
              className="input"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => setSlug((s) => slugify(s))}
            />
            {isEdit && status === "published" && (
              <Link href={`/${slug}`} target="_blank" className="p-2 text-ink/40 hover:text-turquoise-dark shrink-0" title="Buka halaman">
                <ExternalLink size={16} />
              </Link>
            )}
          </div>
        </div>
        <div>
          <label className="label">H1 (judul utama yang tampil di halaman)</label>
          <input className="input" required value={h1} onChange={(e) => setH1(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Hero Title</label>
            <input className="input" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Hero Description</label>
            <input className="input" value={heroDescription} onChange={(e) => setHeroDescription(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Content</label>
          <RichTextEditor value={content} onChange={setContent} />
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-display font-semibold text-ink">FAQ</h2>
        {faqs.map((f, i) => (
          <div key={f.id || i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1.5">
              <input
                className="input"
                placeholder="Pertanyaan"
                value={f.question}
                onChange={(e) => updateFaq(i, { question: e.target.value })}
              />
              <textarea
                className="input min-h-16"
                placeholder="Jawaban"
                value={f.answer}
                onChange={(e) => updateFaq(i, { answer: e.target.value })}
              />
            </div>
            <button type="button" onClick={() => removeFaq(i)} className="p-2 text-clay/60 hover:text-clay mt-1">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addFaq} className="btn-secondary !py-1.5 text-xs inline-flex items-center gap-1.5">
          <Plus size={14} /> Tambah FAQ
        </button>
        <p className="text-xs text-ink/40">FAQ Schema (JSON-LD FAQPage) dibuat otomatis dari daftar ini.</p>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-display font-semibold text-ink">SEO Metadata</h2>
        <div>
          <label className="label">Meta Title</label>
          <input className="input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={title} />
        </div>
        <div>
          <label className="label">Meta Description</label>
          <textarea className="input min-h-20" maxLength={300} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Meta Keywords</label>
          <input
            className="input"
            placeholder="jasa antar jemput bandung, ojek pribadi bandung"
            value={metaKeywords}
            onChange={(e) => setMetaKeywords(e.target.value)}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Canonical URL (opsional)</label>
            <input className="input" placeholder="Default: URL halaman ini sendiri" value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">OG Image</label>
            <input className="input" type="file" accept="image/*" onChange={(e) => setOgImageFile(e.target.files?.[0] || null)} />
            {ogImage && !ogImageFile && <p className="text-xs text-ink/40 mt-1">Sudah ada gambar tersimpan -- pilih file baru untuk mengganti.</p>}
          </div>
        </div>
        <div>
          <label className="label">Schema JSON (opsional -- kosongkan untuk auto-generate dari field di atas)</label>
          <textarea
            className="input min-h-24 font-mono text-xs"
            placeholder='{"@context": "https://schema.org", ...}'
            value={schemaJson}
            onChange={(e) => setSchemaJson(e.target.value)}
          />
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-display font-semibold text-ink">Taksonomi & CTA</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Kategori</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Daerah</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— Tanpa daerah —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">CTA Button Text</label>
            <input className="input" placeholder="Cari Jasa Sekarang" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
          </div>
          <div>
            <label className="label">CTA Button Link</label>
            <input className="input" placeholder="/marketplace atau /register" value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Featured (ditandai penting/unggulan)
        </label>
      </div>

      {relatedOptions.length > 0 && (
        <div className="card p-5 space-y-2">
          <h2 className="font-display font-semibold text-ink">Related Landing Pages (maks. 6)</h2>
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
            {relatedOptions
              .filter((o) => o.id !== initial?.id)
              .map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-ink/70">
                  <input type="checkbox" checked={relatedIds.includes(o.id)} onChange={() => toggleRelated(o.id)} />
                  {o.title}
                </label>
              ))}
          </div>
        </div>
      )}

      <div className="card p-5 space-y-3">
        <h2 className="font-display font-semibold text-ink">Publikasi</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div>
            <label className="label">Publish Date (opsional -- kosongkan untuk langsung tayang)</label>
            <input className="input" type="datetime-local" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sticky bottom-4">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Landing Page"}
        </button>
        {isEdit && (
          <Link href={`/admin/seo/landing-pages/${initial!.id}/preview`} className="btn-secondary inline-flex items-center gap-1.5">
            <Eye size={16} /> Preview
          </Link>
        )}
      </div>
    </form>
  );
}
