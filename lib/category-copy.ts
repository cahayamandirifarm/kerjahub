export type ExploreTipe = "kerja" | "jasa";

/**
 * Teks kartu kategori di beranda (bagian "Jelajahi Peluang").
 * - tipe "kerja"  -> tab "Saya Butuh Pekerja"    (lowongan dari employer)
 * - tipe "jasa"   -> tab "Saya Butuh Pekerjaan"  (penawaran jasa dari pekerja)
 *
 * Dibuat sebagai fungsi (bukan daftar statis) supaya otomatis mengikuti
 * JOB_CATEGORIES kalau ada kategori baru ditambahkan di lib/types.ts.
 */
export function categoryPostCopy(category: string, tipe: ExploreTipe) {
  if (tipe === "kerja") {
    return {
      title: category,
      subtitle: `Lihat di sini orang membutuhkan ${category}`
    };
  }
  return {
    title: `Jasa ${category}`,
    subtitle: `Lihat di sini orang menawarkan jasa ${category}`
  };
}
