import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import LocationPrompt from "@/components/LocationPrompt";
import NearbyJobsSection from "@/components/NearbyJobsSection";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const revalidate = 0;

/**
 * Halaman khusus "Lowongan & Pekerja Terdekat".
 *
 * Sebelumnya tombol "Temukan Lowongan & Pekerja Sekitar" di beranda cuma
 * scroll ke section #lowongan-terdekat di halaman beranda -- otomatis ikut
 * menampilkan section "Jelajahi Peluang" di bawahnya karena keduanya
 * berbagi satu halaman.
 *
 * Sekarang tombol tersebut membuka halaman ini, yang HANYA berisi
 * NearbyJobsSection (Lowongan & Pekerja Terdekat) tanpa section
 * "Jelajahi Peluang".
 */
export default function LowonganPekerjaTerdekatPage() {
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} />
          Kembali ke beranda
        </Link>
      </div>

      <div className="mt-4">
        <NearbyJobsSection />
      </div>

      <BottomNav />
      <LocationPrompt />
    </div>
  );
}
