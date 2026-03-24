import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../lib/api";
import i18n from "../i18n";

export type CronScheduleKind = "at" | "every" | "cron";

export interface CronSchedule {
  kind: CronScheduleKind;
  at_ms?: number | null;
  every_ms?: number | null;
  expr?: string | null;
  tz?: string | null;
}

export interface CronPayload {
  message: string;
  deliver: boolean;
  channel?: string | null;
  to?: string | null;
}

export interface CronState {
  next_run_at_ms: number | null;
  last_run_at_ms: number | null;
  last_status: string | null;
  last_error: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronState;
  delete_after_run: boolean;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface CronJobRequest {
  name: string;
  enabled?: boolean;
  schedule: CronSchedule;
  payload: CronPayload;
  delete_after_run?: boolean;
}

export function useCronJobs() {
  return useQuery<CronJob[]>({
    queryKey: ["cron", "jobs"],
    queryFn: () => api.get("/cron/jobs").then((r) => r.data),
    refetchInterval: 30000,
  });
}

export function useCreateCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CronJobRequest) =>
      api.post("/cron/jobs", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron", "jobs"] });
      toast.success(i18n.t("cron.created"));
    },
  });
}

export function useUpdateCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CronJobRequest>) =>
      api.put(`/cron/jobs/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron", "jobs"] });
      toast.success(i18n.t("cron.saved"));
    },
  });
}

export function useDeleteCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/cron/jobs/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron", "jobs"] });
      toast.success(i18n.t("cron.deleted"));
    },
  });
}

export function useToggleCronJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`/cron/jobs/${id}`, { enabled }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cron", "jobs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Cron execution history (sessions)
// ---------------------------------------------------------------------------

export interface CronSession {
  key: string;
  created_at: string | null;
  updated_at: string | null;
  last_message: string | null;
}

export interface CronSessionMessage {
  role: string;
  content: string | null;
  timestamp: string | null;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  name: string | null;
}

export function useCronSessions(params?: { jobId?: string | null; search?: string | null }) {
  const jobId = params?.jobId ?? null;
  const search = params?.search ?? null;
  return useQuery<CronSession[]>({
    queryKey: ["cron", "sessions", { jobId, search }],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (jobId) qp.set("job_id", jobId);
      if (search) qp.set("search", search);
      const qs = qp.toString();
      return api.get(`/cron/sessions${qs ? `?${qs}` : ""}`).then((r) => r.data);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
}

export function useCronSessionMessages(key: string | null) {
  return useQuery<CronSessionMessage[]>({
    queryKey: ["cron", "sessions", key, "messages"],
    queryFn: () => api.get(`/cron/sessions/${encodeURIComponent(key!)}/messages`).then((r) => r.data),
    enabled: !!key,
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });
}
