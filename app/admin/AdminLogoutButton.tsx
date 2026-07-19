"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export default function AdminLogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }
  return (
    <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-paper/50 hover:text-paper">
      <LogOut size={15} /> Keluar
    </button>
  );
}
