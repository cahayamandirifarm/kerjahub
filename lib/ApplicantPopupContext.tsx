"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";
import { revalidateListings } from "@/lib/revalidate-listings";

export interface PendingApplicant {
  application_id: string;
  job_id: string;
  job_title: string;
  job_price: number;
  posted_by_role: "employer" | "worker";
  message: string | null;
  applied_at: string;
  applicant_id: string;
  applicant_name: string;
  applicant_avatar: string | null;
  applicant_bio: string | null;
  applicant_skills: string[] | null;
  applicant_kyc_status: string;
  applicant_rating_avg: number;
  applicant_rating_count: number;
  applicant_completed_jobs_count: number;
}

interface ApplicantPopupState {
  popup: PendingApplicant | null;
  loading: boolean;
  processing: boolean;
  refresh: () => Promise<void>;
  dismiss: () => Promise<void>;
  accept: () => Promise<{ error?: string; escrowId?: string; payerId?: string }>;
  reject: () => Promise<{ error?: string }>;
}

const ApplicantPopupContext = createContext<ApplicantPopupState>({
  popup: null,
  loading: true,
  processing: false,
  refresh: async () => {},
  dismiss: async () => {},
  accept: async () => ({}),
  reject: async () => ({})
});

export function ApplicantPopupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [popup, setPopup] = useState<PendingApplicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setPopup(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_pending_applicant_popup");
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
      .channel(`applicant-popup-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "applications" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const dismiss = useCallback(async () => {
    if (!popup) return;
    setProcessing(true);
    await supabase.rpc("dismiss_applicant_popup", { p_application_id: popup.application_id });
    setProcessing(false);
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  const accept = useCallback(async () => {
    if (!popup) return {};
    setProcessing(true);
    const { data, error } = await supabase.rpc("accept_applicant", { p_application_id: popup.application_id });
    setProcessing(false);
    if (error) return { error: error.message };
    revalidateListings();
    await refresh();
    const row = Array.isArray(data) ? data[0] : data;
    return { escrowId: row?.escrow_id as string | undefined, payerId: row?.payer_id as string | undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  const reject = useCallback(async () => {
    if (!popup) return {};
    setProcessing(true);
    const { error } = await supabase.rpc("reject_applicant", { p_application_id: popup.application_id });
    setProcessing(false);
    if (error) return { error: error.message };
    await refresh();
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  return (
    <ApplicantPopupContext.Provider value={{ popup, loading, processing, refresh, dismiss, accept, reject }}>
      {children}
    </ApplicantPopupContext.Provider>
  );
}

export function useApplicantPopup() {
  return useContext(ApplicantPopupContext);
}
