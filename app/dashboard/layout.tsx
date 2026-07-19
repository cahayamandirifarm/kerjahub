import BottomNav from "@/components/BottomNav";
import Navbar from "@/components/Navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      <BottomNav />
    </div>
  );
}
