import Link from "next/link";
import { waLink } from "@/lib/whatsapp";
import { MessageCircle, Phone } from "lucide-react";

export default function JobContactCard({
  jobTitle,
  conversationId,
  counterpartName,
  counterpartPhone,
  counterpartRole
}: {
  jobTitle: string;
  conversationId: string | null;
  counterpartName: string | null;
  counterpartPhone: string | null;
  counterpartRole: "Pemberi kerja" | "Pekerja";
}) {
  const wa = waLink(counterpartPhone, `Halo ${counterpartName ?? ""}, terkait pekerjaan "${jobTitle}" ya.`);

  return (
    <div className="card p-4 mb-4">
      <p className="text-xs text-ink/50 mb-2">
        Komunikasi dengan {counterpartRole.toLowerCase()}: <span className="font-semibold text-ink">{counterpartName ?? "-"}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={conversationId ? `/chat/${conversationId}` : "/chat"}
          className="btn-secondary !py-2 text-sm inline-flex items-center justify-center gap-1.5"
        >
          <MessageCircle size={15} /> Buka Chat
        </Link>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="rounded-full text-sm font-semibold py-2 inline-flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "#25D366", color: "#ffffff" }}
          >
            <Phone size={15} /> WhatsApp
          </a>
        ) : (
          <span className="rounded-full text-sm font-medium py-2 inline-flex items-center justify-center gap-1.5 bg-line/50 text-ink/40">
            <Phone size={15} /> No. tidak ada
          </span>
        )}
      </div>
    </div>
  );
}
