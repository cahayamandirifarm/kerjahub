"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { readCache, writeCache } from "@/lib/client-cache";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  notif_sound_enabled: boolean;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  async function loadProfile(uid: string) {
    // Tampilkan dulu profil dari cache lokal (kalau ada) supaya UI (nama,
    // avatar, dll) langsung terisi tanpa nunggu network -- tetap lanjut
    // fetch data terbaru dari server di bawah, jadi datanya selalu disegarkan
    // ulang tiap kali login/sesi berubah, bukan menggantikan fetch.
    const cachedProfile = await readCache<Profile>(`profile:${uid}`, "idb");
    if (cachedProfile && cachedProfile.role !== "admin") {
      setProfile(cachedProfile);
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, role, notif_sound_enabled")
      .eq("id", uid)
      .single();

    // Akun dengan role admin hanya boleh dipakai di panel admin (/admin, /admin-login).
    // Kalau sesi admin kepakai di aplikasi pengguna biasa, langsung sign out.
    if (data?.role === "admin" && !pathname?.startsWith("/admin")) {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setLoading(false);
      router.push("/login");
      return;
    }

    setProfile(data as Profile | null);
    if (data) await writeCache(`profile:${uid}`, data, "idb");
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadProfile(data.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  return <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
