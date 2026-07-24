// Helper pagination untuk halaman-halaman admin.
//
// Dipakai supaya query ke Supabase tidak lagi menarik SEMUA baris (atau
// limit besar seperti 100/200) setiap kali halaman admin dibuka, yang
// sebelumnya jadi salah satu beban terbesar ke server/database saat data
// sudah banyak. Sekarang tiap halaman admin hanya menarik PAGE_SIZE (10)
// baris per klik, ditambah 1 baris ekstra untuk mendeteksi apakah tombol
// "Berikutnya" perlu ditampilkan -- jadi TIDAK perlu query count() terpisah
// yang justru menambah beban.

export const ADMIN_PAGE_SIZE = 10;

export function parsePage(pageParam: string | undefined): number {
  const n = Number(pageParam);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

// Range untuk Supabase .range(from, to) -- menarik PAGE_SIZE + 1 baris
// supaya kita tahu apakah masih ada halaman berikutnya, tanpa query count().
export function adminRange(page: number, pageSize: number = ADMIN_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // +1 baris ekstra
  return { from, to };
}

// Potong hasil query (yang berisi pageSize + 1 baris) jadi baris yang benar-benar
// ditampilkan + info apakah ada halaman berikutnya.
export function splitPage<T>(rows: T[] | null | undefined, pageSize: number = ADMIN_PAGE_SIZE) {
  const all = rows ?? [];
  const hasNext = all.length > pageSize;
  return { pageRows: all.slice(0, pageSize), hasNext };
}
