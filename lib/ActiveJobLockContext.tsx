"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

export interface ActiveJob {
  job_id: string;
  title: string;
  stage: string;
  category: string;
  price: number;
  my_role: "employer" | "worker";
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  other_phone: string | null;
  conversation_id: string | null;
  paid_at: string | null;
}

interface ActiveJobLockState {
  activeJob: ActiveJob | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ActiveJobLockContext = createContext<ActiveJobLockState>({
  activeJob: null,
  loading: true,
  refresh: async () => {}
});

export function ActiveJobLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setActiveJob(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_my_active_job");
    if (!error) {
      setActiveJob((data && data[0]) || null);
    }
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`active-job-lock-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jobs" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ActiveJobLockContext.Provider value={{ activeJob, loading, refresh }}>{children}</ActiveJobLockContext.Provider>
  );
}

export function useActiveJobLock() {
  return useContext(ActiveJobLockContext);
}
