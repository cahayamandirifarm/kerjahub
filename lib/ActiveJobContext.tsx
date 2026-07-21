"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/AuthContext";

interface ActiveJob {
  id: string;
  job_id: string;
  job_title: string;
  employer_id: string;
  employer_name: string;
  employer_phone: string;
  worker_id: string;
  stage: string;
  price: number;
  location: string;
  description: string;
  accepted_at: string;
}

interface ActiveJobContextType {
  activeJobs: ActiveJob[];
  dismissedJobs: Set<string>;
  dismissJob: (jobId: string) => void;
  completeJob: (jobId: string) => void;
  hasPendingJobs: boolean;
}

const ActiveJobContext = createContext<ActiveJobContextType | null>(null);

export function ActiveJobProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [dismissedJobs, setDismissedJobs] = useState<Set<string>>(new Set());
  const supabase = createClient();

  // Load active jobs saat user login
  const loadActiveJobs = useCallback(async () => {
    if (!user || profile?.role !== "worker") {
      setActiveJobs([]);
      return;
    }

    try {
      // Ambil pekerjaan dengan status "dana_diamankan" sampai "menunggu_konfirmasi_selesai"
      const { data, error } = await supabase
        .from("job_applications")
        .select(
          `
          id,
          job_id,
          jobs(id, title, description, location, price),
          employer:profiles!job_applications_employer_id_fkey(id, username, phone),
          worker_id,
          stage,
          accepted_at
        `
        )
        .eq("worker_id", user.id)
        .in("stage", [
          "dana_diamankan",
          "dikerjakan",
          "menunggu_konfirmasi_selesai",
          "revisi"
        ])
        .order("accepted_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const formatted = data.map((app: any) => ({
          id: app.id,
          job_id: app.job_id,
          job_title: app.jobs?.title || "Pekerjaan",
          employer_id: app.employer?.id || "",
          employer_name: app.employer?.username || "Pemberi Kerja",
          employer_phone: app.employer?.phone || "",
          worker_id: app.worker_id,
          stage: app.stage,
          price: app.jobs?.price || 0,
          location: app.jobs?.location || "",
          description: app.jobs?.description || "",
          accepted_at: app.accepted_at
        }));
        setActiveJobs(formatted);
      }
    } catch (err) {
      console.error("Error loading active jobs:", err);
    }
  }, [user, profile, supabase]);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!user || profile?.role !== "worker") return;

    loadActiveJobs();

    // Subscribe to job_applications changes untuk update status real-time
    const channel = supabase
      .channel(`active-jobs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
          filter: `worker_id=eq.${user.id}`
        },
        (payload) => {
          loadActiveJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.role, loadActiveJobs]);

  const dismissJob = useCallback((jobId: string) => {
    setDismissedJobs((prev) => new Set([...prev, jobId]));
  }, []);

  const completeJob = useCallback((jobId: string) => {
    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    dismissJob(jobId);
  }, [dismissJob]);

  const hasPendingJobs = activeJobs.some((job) => !dismissedJobs.has(job.id));

  return (
    <ActiveJobContext.Provider
      value={{
        activeJobs: activeJobs.filter((job) => !dismissedJobs.has(job.id)),
        dismissedJobs,
        dismissJob,
        completeJob,
        hasPendingJobs
      }}
    >
      {children}
    </ActiveJobContext.Provider>
  );
}

export function useActiveJobs() {
  const context = useContext(ActiveJobContext);
  if (!context) {
    throw new Error("useActiveJobs must be used within ActiveJobProvider");
  }
  return context;
}
