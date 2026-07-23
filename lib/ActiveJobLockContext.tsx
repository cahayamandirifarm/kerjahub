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
  escrow_id: string | null;
  escrow_status: "menunggu_pembayaran" | "menunggu_konfirmasi_admin" | "berhasil" | "ditolak" | "dibatalkan" | null;
  total_amount: number | null;
  base_amount: number | null;
  wallet_deducted: number | null;
  unique_code: number | null;
}

interface ActiveJobLockState {
  activeJob: ActiveJob | null;
  loading: boolean;
  refresh: () => Promise<void>;
  cancelling: boolean;
  cancelPendingPayment: () => Promise<{ error?: string }>;
}

const ActiveJobLockContext = createContext<ActiveJobLockState>({
  activeJob: null,
  loading: true,
  refresh: async () => {},
  cancelling: false,
  cancelPendingPayment: async () => ({})
});

export function ActiveJobLockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
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

  const cancelPendingPayment = useCallback(async () => {
    if (!activeJob) return {};
    setCancelling(true);
    const { error } = await supabase.rpc("cancel_pending_payment", { p_job_id: activeJob.job_id });
    setCancelling(false);
    if (error) return { error: error.message };
    await refresh();
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`active-job-lock-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jobs" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "escrow_payments" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ActiveJobLockContext.Provider value={{ activeJob, loading, refresh, cancelling, cancelPendingPayment }}>
      {children}
    </ActiveJobLockContext.Provider>
  );
}

export function useActiveJobLock() {
  return useContext(ActiveJobLockContext);
}
