import Link from "next/link";
import { Lock } from "lucide-react";

// Ditampilkan ke pengunjung yang BELUM login saat mencoba membuka halaman
// ke-2 dst dari feed publik (postingan kerja di beranda / produk
// marketplace) -- guest hanya boleh melihat halaman pertama (10 item).
export default function GuestPageGate({ next }: { next: string }) {
  return (
    <div className="card p-8 text-center max-w-md mx-auto my-10">
      <Lock className="mx-auto mb-3 text-ink/40" size={28} />
      <h3 className="font-display text-lg font-semibold text-ink mb-1">Masuk untuk lihat lebih banyak</h3>
      <p className="text-sm text-ink/60 mb-5">
        Halaman ini hanya menampilkan 10 postingan/produk pertama untuk pengunjung. Masuk atau daftar dulu untuk
        melanjutkan menjelajah halaman berikutnya.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary !px-5 !py-2.5 text-sm">
          Masuk
        </Link>
        <Link href="/register" className="btn-brand !px-5 !py-2.5 text-sm">
          Daftar
        </Link>
      </div>
    </div>
  );
}
