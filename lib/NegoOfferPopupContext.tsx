"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

export interface PendingNegoOffer {
  kind: "offer" | "inquiry";
  offer_id: string | null;
  conversation_id: string;
  job_id: string;
  job_title: string;
  amount: number | null;
  created_at: string;
  offerer_id: string;
  offerer_name: string;
  offerer_avatar: string | null;
}

interface NegoOfferPopupState {
  popup: PendingNegoOffer | null;
  loading: boolean;
  processing: boolean;
  refresh: () => Promise<void>;
  dismiss: () => Promise<void>;
}

const NegoOfferPopupContext = createContext<NegoOfferPopupState>({
  popup: null,
  loading: true,
  processing: false,
  refresh: async () => {},
  dismiss: async () => {}
});

export function NegoOfferPopupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [popup, setPopup] = useState<PendingNegoOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    if (!user) {
      setPopup(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_pending_nego_popup");
    if (!error) {
      setPopup((data && data[0]) || null);
    }
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: tawaran nego dikirim/diproses lewat halaman chat (bukan
  // halaman ini), jadi popup ini murni pendengar postgres_changes --
  // begitu ada tawaran baru masuk (INSERT) atau tawaran lama berubah
  // status (UPDATE, mis. dibatalkan lawan bicara sebelum sempat
  // dilihat), daftar tawaran pending di-refresh.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`nego-offer-popup-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nego_offers" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "nego_offers" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => refresh())
      .subscribe();

    // Fallback polling -- jaring pengaman kalau koneksi realtime putus,
    // sama seperti pola di halaman chat.
    const pollInterval = setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const dismiss = useCallback(async () => {
    if (!popup) return;
    setProcessing(true);
    if (popup.kind === "offer" && popup.offer_id) {
      await supabase.rpc("dismiss_nego_offer_popup", { p_offer_id: popup.offer_id });
    } else {
      await supabase.rpc("dismiss_nego_inquiry_popup", { p_conversation_id: popup.conversation_id });
    }
    setProcessing(false);
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popup, refresh]);

  return (
    <NegoOfferPopupContext.Provider value={{ popup, loading, processing, refresh, dismiss }}>
      {children}
    </NegoOfferPopupContext.Provider>
  );
}

export function useNegoOfferPopup() {
  return useContext(NegoOfferPopupContext);
}
