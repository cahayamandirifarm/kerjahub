"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

// Menjaga status online/offline pengguna untuk fitur "Pekerja Terdekat".
export default function OnlineStatus() {
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;

    supabase.from("profiles").update({ is_online: true }).eq("id", user.id).then();

    const setOffline = () => {
      supabase.from("profiles").update({ is_online: false }).eq("id", user.id);
    };

    const interval = setInterval(() => {
      supabase.from("profiles").update({ is_online: true }).eq("id", user.id);
    }, 4 * 60 * 1000);

    window.addEventListener("beforeunload", setOffline);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) setOffline();
      else supabase.from("profiles").update({ is_online: true }).eq("id", user.id);
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", setOffline);
      setOffline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
