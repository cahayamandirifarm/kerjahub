import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import EscrowPaymentModal from "./EscrowPaymentModal";

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

  // escrow.employer_id di sini berarti PAYER (pihak yang wajib bayar) --
  // bisa jadi pembuat postingan (lowongan kerja biasa) ATAU pelamar
  // (postingan jasa/mencari kerja), tergantung siapa yang seharusnya bayar.
  const isPayer = escrow.employer_id === user.id;

  const { data: bank } = escrow.bank_account_id
    ? await supabase.from("bank_accounts").select("*").eq("id", escrow.bank_account_id).single()
    : { data: null };

  const { data: settings } = await supabase
    .from("payment_settings")
    .select("qris_image_url")
    .eq("id", 1)
    .single();

  return (
    <EscrowPaymentModal
      escrow={escrow as any}
      jobTitle={(escrow as any).jobs?.title ?? ""}
      isPayer={isPayer}
      bank={bank}
      qrisImageUrl={settings?.qris_image_url ?? null}
    />
  );
}
