// Server component murni -- render tag <script type="application/ld+json">.
// Dipakai di app/[slug]/page.tsx. JSON.stringify aman dari XSS di sini
// karena kontennya cuma data hasil generate/isian admin (bukan input user
// publik), tapi tetap kita escape "</script>" jaga-jaga.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
