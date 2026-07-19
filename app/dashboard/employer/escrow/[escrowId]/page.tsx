import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import EscrowPaymentForm from "./EscrowPaymentForm";

function formatRupiah(n: number) {
  return "Rp " + Number(n ?? 0).toLocaleString("id-ID");
}

export default async function EscrowPaymentPage({ params }: { params: { escrowId: string } }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/employer/escrow/${params.escrowId}`);

  const { data: escrow } = await supabase
    .from("escrow_payments")
    .select("*, jobs(title)")
    .eq("id", params.escrowId)
    .single();

  if (!escrow) notFound();

  const { data: bank } = escrow.bank_account_id
    ? await supabase.from("bank_accounts").select("*").eq("id", escrow.bank_account_id).single()
    : { data: null };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Pembayaran Escrow</h1>
      <p className="text-sm text-ink/60 mb-6">{(escrow as any).jobs?.title}</p>

      <div className="card p-5 bg-turquoise-dark text-paper mb-4">
        <p className="text-paper/70 text-sm">Total transfer (termasuk kode unik)</p>
        <p className="font-display text-3xl font-semibold mt-1">{formatRupiah(escrow.total_amount)}</p>
        <p className="text-xs text-paper/60 mt-2">
          Nilai pekerjaan {formatRupiah(escrow.base_amount)} + kode unik {escrow.unique_code} — transfer angka
          persis ini agar admin mudah mencocokkan mutasi rekening.
        </p>
      </div>

      {bank && (
        <div className="card p-5 mb-4">
          <h2 className="font-display text-lg font-semibold mb-2">Transfer ke rekening ini</h2>
          <p className="text-sm text-ink/70">
            <span className="font-semibold">{bank.bank_name}</span>
            <br />
            {bank.account_number}
            <br />
            a.n. {bank.account_holder}
          </p>
        </div>
      )}

      <EscrowPaymentForm escrowId={escrow.id} status={escrow.status} proofUrl={escrow.proof_url} />
    </div>
  );
}
