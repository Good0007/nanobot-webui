import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../lib/api";
import i18n from "../i18n";

export interface AgentSettings {
  model: string;
  provider: string;
  max_tokens: number;
  temperature: number;
  max_iterations: number;
  context_window_tokens: number;
  reasoning_effort: string;
  workspace: string;
  restrict_to_workspace?: boolean;
  exec_timeout?: number;
  exec_enable?: boolean;
  exec_sandbox?: string;
  path_append?: string;
  web_search_api_key?: string;
  web_proxy?: string | null;
  web_enable?: boolean;
  web_search_provider?: string;
  web_search_base_url?: string;
  web_search_max_results?: number;
  web_search_timeout?: number;
  ssrf_whitelist?: string[];
  dream_interval_h?: number;
  dream_model_override?: string | null;
  dream_max_batch_size?: number;
  dream_max_iterations?: number;
  send_progress?: boolean;
  send_tool_hints?: boolean;
  channels_send_max_retries?: number;
  channels_transcription_provider?: string;
}

export interface GatewayConfig {
  host: string;
  port: number;
  heartbeat_enabled: boolean;
  heartbeat_interval: number;
}

export function useAgentSettings() {
  return useQuery<AgentSettings>({
    queryKey: ["config", "agent"],
    queryFn: () => api.get("/config/agent").then((r) => r.data),
  });
}

export function useUpdateAgentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AgentSettings>) =>
      api.patch("/config/agent", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", "agent"] });
    },
  });
}

export function useGatewayConfig() {
  return useQuery<GatewayConfig>({
    queryKey: ["config", "gateway"],
    queryFn: () => api.get("/config/gateway").then((r) => r.data),
  });
}

export function useUpdateGatewayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<GatewayConfig>) =>
      api.patch("/config/gateway", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", "gateway"] });
      toast.success(i18n.t("settings.saved"));
    },
  });
}

export function useWorkspaceFile(name: string) {
  return useQuery<{ name: string; content: string }>({
    queryKey: ["config", "workspace-file", name],
    queryFn: () => api.get(`/config/workspace-file/${name}`).then((r) => r.data),
    enabled: !!name,
  });
}

export function useSaveWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      api.put(`/config/workspace-file/${name}`, { content }).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["config", "workspace-file", vars.name] });
      toast.success(i18n.t("settings.saved"));
    },
  });
}

export async function exportWorkspace(): Promise<void> {
  const resp = await api.get("/config/workspace/export", { responseType: "blob" });
  const cd: string = resp.headers["content-disposition"] ?? "";
  const match = cd.match(/filename=([^\s;]+)/);
  const filename = match ? match[1] : "workspace.zip";
  const url = URL.createObjectURL(resp.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useImportWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<{ ok: boolean; backup: string | null }>(
        "/config/workspace/import",
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      ).then((r) => r.data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["config", "workspace-file"] });
      const msg = data.backup
        ? i18n.t("sysconfig.importSuccessBackup", { path: data.backup })
        : i18n.t("sysconfig.importSuccess");
      toast.success(msg);
    },
    onError: () => toast.error(i18n.t("sysconfig.importFailed")),
  });
}

export function useRawConfig() {
  return useQuery<{ content: string }>({
    queryKey: ["config", "raw"],
    queryFn: () => api.get("/config/raw").then((r) => r.data),
  });
}

export function useSaveRawConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.put("/config/raw", { content }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config"] });
      toast.success(i18n.t("sysconfig.saved"));
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? i18n.t("sysconfig.saveFailed");
      toast.error(msg);
    },
  });
}

// ---------------------------------------------------------------------------
// S3 / OSS Storage
// ---------------------------------------------------------------------------

export interface S3Config {
  enabled: boolean;
  endpoint_url: string;
  access_key_id: string;
  secret_access_key: string; // masked in responses
  bucket: string;
  region: string;
  public_base_url: string;
}

export function useS3Config() {
  return useQuery<S3Config>({
    queryKey: ["config", "s3"],
    queryFn: () => api.get("/config/s3").then((r) => r.data),
  });
}

export function useSaveS3Config() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<S3Config>) =>
      api.put("/config/s3", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", "s3"] });
      toast.success(i18n.t("s3.saved"));
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? i18n.t("s3.saveFailed");
      toast.error(msg);
    },
  });
}

export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{ url: string }>("/config/s3/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.url;
}

export function useLogs(lines: number = 500, keyword: string = "") {
  return useQuery<{ content: string, path?: string }>({
    queryKey: ["config", "logs", lines, keyword],
    queryFn: () => api.get(`/config/logs?lines=${lines}&keyword=${encodeURIComponent(keyword)}`).then((r) => r.data),
    refetchInterval: 2000, // auto refresh every 2 seconds
  });
}
