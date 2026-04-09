import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../lib/api";
import i18n from "../i18n";
import { useChatStore } from "../stores/chatStore";

export interface SessionInfo {
  key: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
}

export interface MessageInfo {
  role: string;
  content: string | null;
  timestamp?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export function useSessions() {
  return useQuery<SessionInfo[]>({
    queryKey: ["sessions"],
    queryFn: () => api.get("/sessions").then((r) => r.data),
  });
}

export function useSessionMessages(key: string) {
  return useQuery<MessageInfo[]>({
    queryKey: ["sessions", key, "messages"],
    queryFn: () =>
      api.get(`/sessions/${encodeURIComponent(key)}/messages`).then((r) => r.data),
    enabled: !!key,
  });
}

export function useSessionMemory(key: string) {
  return useQuery<MessageInfo[]>({
    queryKey: ["sessions", key, "memory"],
    queryFn: () =>
      api.get(`/sessions/${encodeURIComponent(key)}/memory`).then((r) => r.data),
    enabled: !!key,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api.delete(`/sessions/${encodeURIComponent(key)}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(i18n.t("chat.sessionDeleted"));
    },
  });
}

export function useRevokeMessage() {
  const qc = useQueryClient();
  const revokeMessage = useChatStore((s) => s.revokeMessage);
  return useMutation({
    mutationFn: ({ key, index }: { key: string; index: number }) =>
      api.delete(`/sessions/${encodeURIComponent(key)}/messages/${index}`).then((r) => r.data),
    onSuccess: (_data, vars) => {
      // Immediately remove from in-memory chat store (source of truth for the displayed messages)
      revokeMessage(vars.index);
      qc.invalidateQueries({ queryKey: ["sessions", vars.key, "messages"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success(i18n.t("chat.messageRevoked", "Message revoked"));
    },
  });
}
