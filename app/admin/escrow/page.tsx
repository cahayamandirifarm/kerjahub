import { createClient } from "@/lib/supabase/server";
import { AdminTxReviewButtons } from "@/components/AdminReviewButtons";
import Pagination from "@/components/Pagination";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

// 10 pengajuan per halaman agar query & payload halaman admin lebih ringan.
const PAGE_SIZE = 10;

export default async function AdminEscrowPage({ searchParams }: { searchParams: { page?: string } }) {
  const supabase = createClient();

  const pageParam = Number(searchParams?.page);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const { data: rows } = await supabase
    .from("escrow_payments")
    .select("*, jobs(title), employer:profiles!escrow_payments_employer_id_fkey(full_name)")
    .eq("status", "menunggu_konfirmasi_admin")
    .order("created_at", { ascending: true })
    .range(from, to);

  const hasNext = (rows?.length || 0) > PAGE_SIZE;
  const escrows = (rows || []).slice(0, PAGE_SIZE);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Konfirmasi Pembayaran Escrow</h1>
      <div className="space-y-3">
        {(!escrows || escrows.length === 0) && (
          <div className="card p-6 text-center text-ink/50 text-sm">Tidak ada pembayaran escrow yang menunggu.</div>
        )}
        {escrows?.map((e: any) => (
          <div key={e.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold">{e.employer?.full_name}</p>
              <p className="text-sm text-ink/50">{e.jobs?.title}</p>
              <p className="text-lg font-display font-semibold text-gold-dark">{formatRupiah(e.total_amount)}</p>
              <p className="text-xs text-ink/40">
                Sisa transfer {formatRupiah(e.base_amount)} + kode unik {e.unique_code}
              </p>
              {e.wallet_deducted > 0 && (
                <p className="text-xs text-turquoise font-semibold">
                  {formatRupiah(e.wallet_deducted)} sudah terpotong otomatis dari saldo
                </p>
              )}
              {e.proof_url && (
                <a href={e.proof_url} target="_blank" className="text-xs font-semibold text-turquoise underline">
                  Lihat bukti transfer
                </a>
              )}
            </div>
            <AdminTxReviewButtons txId={e.id} rpcName="admin_confirm_escrow" idParam="p_escrow_id" />
          </div>
        ))}
      </div>
      <Pagination basePath="/admin/escrow" params={{}} currentPage={page} hasNext={hasNext} />
    </div>
  );
}
