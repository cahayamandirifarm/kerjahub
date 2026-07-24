"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import { revalidateListings } from "@/lib/revalidate-listings";

export interface PendingFinish {
  job_id: string;
  job_title: string;
  category: string;
  posted_by_role: string;
  price: number;
  completed_at: string | null;
  poster_received_wage: boolean;
  wage_amount: number | null;
}

interface FinishPopupState {
  popup: PendingFinish | null;
  loading: boolean;
  processing: boolean;
  refresh: () => Promise<void>;
  keepPosted: () => Promise<{ error?: string; newJobId?: string }>;
  removePosting: () => Promise<{ error?: string }>;
}

const FinishPopupContext = createContext<FinishPopupState>({
  popup: null,
  loading: true,
  processing: false,
  refresh: async () => {},
  keepPosted: async () => ({}),
  removePosting: async () => ({})
});

export function FinishPopupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [popup, setPopup] = useState<PendingFinish | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setPopup(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_pending_finish_popup");
    if (!error) {
      setPopup((data && data[0]) || null);
    }
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`finish-popup-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const keepPosted = useCallback(async () => {
    if (!popup) return {};
    setProcessing(true);
    const { data, error } = await supabase.rpc("keep_job_posting", { p_job_id: popup.job_id });
    setProcessing(false);
    if (error) return { error: error.message };
    revalidateListings();
    await refresh();
    return { newJobId: (data as string) || undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  const removePosting = useCallback(async () => {
    if (!popup) return {};
    setProcessing(true);
    const { error } = await supabase.rpc("remove_job_posting", { p_job_id: popup.job_id });
    setProcessing(false);
    if (error) return { error: error.message };
    revalidateListings();
    await refresh();
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  return (
    <FinishPopupContext.Provider value={{ popup, loading, processing, refresh, keepPosted, removePosting }}>
      {children}
    </FinishPopupContext.Provider>
  );
}

export function useFinishPopup() {
  return useContext(FinishPopupContext);
}
