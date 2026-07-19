import { createClient } from "@/lib/supabase/server";

export default async function AdminRatingsPage() {
  const supabase = createClient();
  const { data: ratings } = await supabase
    .from("ratings")
    .select("*, worker:profiles!ratings_worker_id_fkey(full_name), employer:profiles!ratings_employer_id_fkey(full_name), jobs(title)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Rating & Ulasan</h1>
      <div className="space-y-3">
        {(!ratings || ratings.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Belum ada rating.</div>
        )}
        {ratings?.map((r: any) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{r.worker?.full_name}</p>
              <span className="text-gold-dark font-semibold">
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </span>
            </div>
            <p className="text-xs text-ink/50">
              {r.jobs?.title} — dinilai oleh {r.employer?.full_name}
            </p>
            {r.review && <p className="text-sm text-ink/70 mt-2">{r.review}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
