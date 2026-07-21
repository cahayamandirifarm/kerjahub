"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

export interface PendingCompletion {
  job_id: string;
  job_title: string;
  job_price: number;
  category: string;
  worker_id: string;
  worker_name: string;
  worker_avatar: string | null;
  worker_kyc_status: string;
  worker_rating_avg: number;
  worker_rating_count: number;
  worker_completed_jobs_count: number;
  photo_urls: string[];
  conversation_id: string | null;
}

interface CompletionPopupState {
  popup: PendingCompletion | null;
  loading: boolean;
  processing: boolean;
  refresh: () => Promise<void>;
  dismiss: () => Promise<void>;
  approve: (rating: number, review: string) => Promise<{ error?: string }>;
  requestRevision: (note: string) => Promise<{ error?: string }>;
}

const CompletionPopupContext = createContext<CompletionPopupState>({
  popup: null,
  loading: true,
  processing: false,
  refresh: async () => {},
  dismiss: async () => {},
  approve: async () => ({}),
  requestRevision: async () => ({})
});

export function CompletionPopupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [popup, setPopup] = useState<PendingCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setPopup(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_pending_completion_popup");
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
      .channel(`completion-popup-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_photos" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const dismiss = useCallback(async () => {
    if (!popup) return;
    setProcessing(true);
    await supabase.rpc("dismiss_completion_popup", { p_job_id: popup.job_id });
    setProcessing(false);
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  const approve = useCallback(
    async (rating: number, review: string) => {
      if (!popup) return {};
      setProcessing(true);
      const { error } = await supabase.rpc("approve_completion", {
        p_job_id: popup.job_id,
        p_rating: rating,
        p_review: review || null
      });
      setProcessing(false);
      if (error) return { error: error.message };
      await refresh();
      return {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [popup, refresh]
  );

  const requestRevision = useCallback(
    async (note: string) => {
      if (!popup) return {};
      setProcessing(true);
      const { error } = await supabase.rpc("request_revision", { p_job_id: popup.job_id, p_note: note || null });
      setProcessing(false);
      if (error) return { error: error.message };
      await refresh();
      return {};
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [popup, refresh]
  );

  return (
    <CompletionPopupContext.Provider value={{ popup, loading, processing, refresh, dismiss, approve, requestRevision }}>
      {children}
    </CompletionPopupContext.Provider>
  );
}

export function useCompletionPopup() {
  return useContext(CompletionPopupContext);
}
