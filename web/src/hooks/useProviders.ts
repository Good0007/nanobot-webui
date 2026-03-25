import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../lib/api";
import i18n from "../i18n";

export interface ProviderInfo {
  name: string;
  api_key_masked: string;
  api_base: string | null;
  extra_headers: Record<string, string> | null;
  has_key: boolean;
  // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
  models: string[];
  // [AI:END]
  is_custom: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  groq: "Groq",
  zhipu: "Zhipu AI",
  dashscope: "DashScope (Alibaba)",
  vllm: "vLLM",
  ollama: "Ollama",
  gemini: "Google Gemini",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  aihubmix: "AiHubMix",
  siliconflow: "SiliconFlow",
  volcengine: "VolcEngine",
  volcengine_coding_plan: "VolcEngine Coding Plan",
  byteplus: "BytePlus",
  byteplus_coding_plan: "BytePlus Coding Plan",
  azure_openai: "Azure OpenAI",
  custom: "Custom",
  openai_codex: "OpenAI Codex",
  github_copilot: "GitHub Copilot",
};

const PROVIDER_DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  dashscope: "https://dashscope.aliyuncs.com/api/v1",
  ollama: "http://localhost:11434",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  moonshot: "https://api.moonshot.cn/v1",
  minimax: "https://api.minimax.chat/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  volcengine_coding_plan: "https://ark.cn-beijing.volces.com/api/coding/v3",
  byteplus: "https://ark.ap-southeast.bytepluses.com/api/v3",
  byteplus_coding_plan: "https://ark.ap-southeast.bytepluses.com/api/coding/v3",
  azure_openai: "https://<your-resource-name>.openai.azure.com",
};

export function getProviderLabel(name: string): string {
  return PROVIDER_LABELS[name] ?? name;
}

export function getProviderDefaultBaseUrl(name: string): string {
  return PROVIDER_DEFAULT_BASE_URLS[name] ?? "";
}

export function useProviders() {
  return useQuery<ProviderInfo[]>({
    queryKey: ["providers"],
    queryFn: () => api.get("/providers").then((r) => r.data),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      api_key,
      api_base,
      extra_headers,
      // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
      models,
      // [AI:END]
    }: {
      name: string;
      api_key?: string;
      api_base?: string;
      extra_headers?: Record<string, string>;
      // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
      models?: string[];
      // [AI:END]
    }) => api.patch(`/providers/${name}`, { api_key, api_base, extra_headers, models }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast.success(i18n.t("providers.saved"));
    },
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; api_key?: string; api_base?: string; extra_headers?: Record<string, string>; models?: string[] }) =>
      api.post("/providers", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast.success(i18n.t("providers.created"));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || err.message || "Failed to create provider");
    }
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/providers/${name}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      toast.success(i18n.t("providers.deleted"));
    },
  });
}
