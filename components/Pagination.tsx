import Link from "next/link";

function buildHref(basePath: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Kontrol halaman sederhana (Sebelumnya/Berikutnya) -- dipakai di beranda
// (postingan kerja) dan marketplace, yang sekarang menampilkan 10 item per
// halaman. `hasNext` juga tetap true untuk tamu (guest) yang belum login --
// tautan "Berikutnya" tetap ditampilkan, tapi halaman tujuannya akan
// menampilkan ajakan login/daftar (lihat GuestPageGate), bukan daftar
// postingan/produk berikutnya.
export default function Pagination({
  basePath,
  params,
  currentPage,
  hasNext
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  currentPage: number;
  hasNext: boolean;
}) {
  if (currentPage === 1 && !hasNext) return null;

  return (
    <div className="flex items-center justify-center gap-3 my-8">
      {currentPage > 1 ? (
        <Link
          href={buildHref(basePath, params, currentPage - 1)}
          className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5"
        >
          Sebelumnya
        </Link>
      ) : (
        <span className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white/50 text-ink/30 cursor-not-allowed">
          Sebelumnya
        </span>
      )}
      <span className="text-sm text-ink/50 font-semibold px-1">Halaman {currentPage}</span>
      {hasNext ? (
        <Link
          href={buildHref(basePath, params, currentPage + 1)}
          className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white text-ink/70 hover:bg-ink/5"
        >
          Berikutnya
        </Link>
      ) : (
        <span className="rounded-pill px-4 py-2 text-sm font-semibold border border-line bg-white/50 text-ink/30 cursor-not-allowed">
          Berikutnya
        </span>
      )}
    </div>
  );
}
