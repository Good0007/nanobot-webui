import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { SecretInput } from "../components/shared/SecretInput";
import { isMasked } from "../lib/utils";
import {
  useProviders,
  useUpdateProvider,
  getProviderLabel,
  getProviderDefaultBaseUrl,
  type ProviderInfo
} from "../hooks/useProviders";
import {
  useAgentSettings, useUpdateAgentSettings,
  useGatewayConfig, useUpdateGatewayConfig,
  useWorkspaceFile, useSaveWorkspaceFile,
} from "../hooks/useConfig";

// ── Providers tab ─────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "🟠", openai: "🟢", openrouter: "🔵", deepseek: "🐋",
  volcengine: "🌋", groq: "⚡", zhipu: "🧠", dashscope: "☁️",
  vllm: "🖥️", gemini: "💎", moonshot: "🌙", minimax: "🔮",
  aihubmix: "🎛️", siliconflow: "💧", azure_openai: "🪟", custom: "⚙️",
};

type ProviderDraft = Partial<{ api_key: string; api_base: string; extra_headers: string }>;

// [AI:START] tool=copilot date=2026-03-12 author=chenweikang
function ModelListEditor({
  models,
  onChange,
}: {
  models: string[];
  onChange: (models: string[]) => void;
}) {
  const { t } = useTranslation();
  const [newModel, setNewModel] = useState("");

  const handleAdd = () => {
    const trimmed = newModel.trim();
    if (trimmed && !models.includes(trimmed)) {
      onChange([...models, trimmed]);
      setNewModel("");
    }
  };

  const handleRemove = (model: string) => {
    onChange(models.filter((m) => m !== model));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{t("providers.models")} ({t("common.optional")})</Label>
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[36px] p-2 rounded-md border bg-background cursor-text"
        onClick={(e) => {
          const input = (e.currentTarget as HTMLElement).querySelector("input");
          input?.focus();
        }}
      >
        {models.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-mono"
          >
            {m}
            <button
              type="button"
              onClick={() => handleRemove(m)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={newModel}
          onChange={(e) => setNewModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
            if (e.key === "Backspace" && !newModel && models.length > 0) {
              onChange(models.slice(0, -1));
            }
          }}
          onBlur={handleAdd}
          placeholder={models.length === 0 ? t("providers.modelsPlaceholder") : ""}
          className="flex-1 min-w-[120px] bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
// [AI:END]

function ProvidersTab() {
  const { t } = useTranslation();
  const { data: providers, isLoading } = useProviders();
  const update = useUpdateProvider();
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
  const [modelsDrafts, setModelsDrafts] = useState<Record<string, string[] | undefined>>({});
  // [AI:END]
  const [expanded, setExpanded] = useState<string[]>([]);

  const toggleExpand = (name: string) =>
    setExpanded((p) => p.includes(name) ? p.filter((n) => n !== name) : [...p, name]);

  const getDraft = (name: string, field: keyof ProviderDraft, original: string) =>
    drafts[name]?.[field] ?? original;

  const setDraft = (name: string, field: keyof ProviderDraft, value: string) =>
    setDrafts((p) => ({ ...p, [name]: { ...p[name], [field]: value } }));

  // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
  const getModelsDraft = (name: string, original: string[]) =>
    modelsDrafts[name] ?? original;

  const setModelsDraft = (name: string, models: string[]) =>
    setModelsDrafts((p) => ({ ...p, [name]: models }));
  // [AI:END]

  const handleSave = (prov: ProviderInfo) => {
    const d = drafts[prov.name] ?? {};
    const apiKey = d.api_key ?? prov.api_key_masked;
    const apiBase = d.api_base ?? (prov.api_base ?? "");
    const headersStr = d.extra_headers;
    let extra_headers: Record<string, string> | undefined;
    if (headersStr !== undefined && headersStr.trim()) {
      try { extra_headers = JSON.parse(headersStr); } catch { /* invalid JSON, skip */ }
    }
    // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
    const models = modelsDrafts[prov.name] !== undefined
      ? modelsDrafts[prov.name]
      : prov.models;
    // [AI:END]
    update.mutate({
      name: prov.name,
      api_key: isMasked(apiKey) ? undefined : apiKey || undefined,
      api_base: apiBase || undefined,
      extra_headers,
      // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
      models,
      // [AI:END]
    });
  };

  if (isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  return (
    <div className="space-y-2">
      {providers?.map((p) => {
        const isExpand = expanded.includes(p.name);
        const apiKey = getDraft(p.name, "api_key", p.api_key_masked);
        const apiBase = getDraft(p.name, "api_base", p.api_base ?? "");
        const extraHeaders = getDraft(p.name, "extra_headers",
          p.extra_headers ? JSON.stringify(p.extra_headers, null, 2) : "");
        // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
        const models = getModelsDraft(p.name, p.models ?? []);
        // [AI:END]
        const icon = PROVIDER_ICONS[p.name] ?? "🤖";
        return (
          <Card key={p.name} className={p.has_key ? "" : "opacity-70"}>
            <CardHeader className="py-3 px-4">
              <button
                className="flex w-full items-center gap-3 text-left"
                onClick={() => toggleExpand(p.name)}
              >
                <span className="text-xl leading-none">{icon}</span>
                <span className="flex-1 font-medium">{getProviderLabel(p.name)}</span>
                <Badge variant={p.has_key ? "default" : "secondary"} className="shrink-0">
                  {p.has_key ? t("providers.configured") : t("providers.notConfigured")}
                </Badge>
                {isExpand
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
            </CardHeader>
            {isExpand && (
              <CardContent className="space-y-3 pt-0 pb-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("providers.apiKey")}</Label>
                    <SecretInput value={apiKey} onChange={(v) => setDraft(p.name, "api_key", v)} placeholder="sk-..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("providers.apiBase")} ({t("common.optional")})</Label>
                    <Input value={apiBase} onChange={(e) => setDraft(p.name, "api_base", e.target.value)}
                      placeholder={getProviderDefaultBaseUrl(p.name) || "https://api.example.com/v1"} className="text-sm" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{t("providers.extraHeaders")} ({t("common.optional")})</Label>
                    <Textarea
                      value={extraHeaders}
                      onChange={(e) => setDraft(p.name, "extra_headers", e.target.value)}
                      placeholder='{"APP-Code": "your-code"}'
                      className="font-mono text-xs h-20 resize-none"
                    />
                  </div>
                  {/* [AI:START] tool=copilot date=2026-03-12 author=chenweikang */}
                  <div className="sm:col-span-2">
                    <ModelListEditor
                      models={models}
                      onChange={(m) => setModelsDraft(p.name, m)}
                    />
                  </div>
                  {/* [AI:END] */}
                </div>
                <Button size="sm" onClick={() => handleSave(p)}
                  disabled={update.isPending}>
                  {t("providers.save")}
                </Button>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Agent tab ─────────────────────────────────────────────────────────────────

const REASONING_EFFORT_OPTIONS = ["__default__", "none", "low", "medium", "high"];

function AgentTab() {
  const { t } = useTranslation();
  const { data: agent, isLoading: loadingAgent } = useAgentSettings();
  const { data: gateway, isLoading: loadingGateway } = useGatewayConfig();
  const { data: providers } = useProviders();
  const updateAgent = useUpdateAgentSettings();
  const updateGateway = useUpdateGatewayConfig();

  // 获取已配置的提供商列表（包含 auto 和所有 has_key 为 true 的提供商）
  const availableProviders = providers 
    ? ["auto", ...providers.filter(p => p.has_key).map(p => p.name)]
    : ["auto"];

  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxToolIter, setMaxToolIter] = useState("");
  const [memoryWindow, setMemoryWindow] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("__default__");
  const [workspace, setWorkspace] = useState("");
  const [agentInited, setAgentInited] = useState(false);

  // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
  // 获取当前选中提供商的模型列表（必须在 useState 之后）
  const selectedProviderModels = providers?.find(p => p.name === provider)?.models ?? [];
  // [AI:END]

  if (agent && !agentInited) {
    setModel(agent.model ?? "");
    setProvider(agent.provider ?? "");
    setMaxTokens(String(agent.max_tokens ?? ""));
    setTemperature(String(agent.temperature ?? ""));
    setMaxToolIter(String(agent.max_iterations ?? ""));
    setMemoryWindow(String(agent.memory_window ?? ""));
    setReasoningEffort(agent.reasoning_effort || "__default__");
    setWorkspace(agent.workspace ?? "");
    setAgentInited(true);
  }

  const handleSaveAgent = () => {
    updateAgent.mutate({
      model: model || undefined,
      provider: provider || undefined,
      max_tokens: maxTokens ? Number(maxTokens) : undefined,
      temperature: temperature ? Number(temperature) : undefined,
      max_iterations: maxToolIter ? Number(maxToolIter) : undefined,
      memory_window: memoryWindow ? Number(memoryWindow) : undefined,
      reasoning_effort: reasoningEffort && reasoningEffort !== "__default__" ? reasoningEffort : undefined,
      workspace: workspace || undefined,
    }, { onSuccess: () => toast.success(t("settings.saved")) });
  };

  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false);
  const [heartbeatInterval, setHeartbeatInterval] = useState("");
  const [gatewayInited, setGatewayInited] = useState(false);

  if (gateway && !gatewayInited) {
    setHost(gateway.host ?? "");
    setPort(String(gateway.port ?? ""));
    setHeartbeatEnabled(gateway.heartbeat_enabled ?? false);
    setHeartbeatInterval(String(gateway.heartbeat_interval ?? ""));
    setGatewayInited(true);
  }

  const handleSaveGateway = () => {
    updateGateway.mutate({
      host: host || undefined,
      port: port ? Number(port) : undefined,
      heartbeat_enabled: heartbeatEnabled,
      heartbeat_interval: heartbeatInterval ? Number(heartbeatInterval) : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAgent ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("settings.provider")}</Label>
                  <Select value={provider} onValueChange={(v) => {
                    setProvider(v);
                    // [AI:START] tool=copilot date=2026-03-12 author=chenweikang
                    // 切换提供商时，如果新提供商有模型列表，自动选择第一个
                    const provModels = providers?.find(p => p.name === v)?.models ?? [];
                    if (provModels.length > 0) {
                      setModel(provModels[0]);
                    }
                    // [AI:END]
                  }}>
                    <SelectTrigger><SelectValue placeholder={t("settings.provider")} /></SelectTrigger>
                    <SelectContent>{availableProviders.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* [AI:START] tool=copilot date=2026-03-12 author=chenweikang */}
                <div className="space-y-1">
                  <Label>{t("settings.model")}</Label>
                  {selectedProviderModels.length > 0 ? (
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("settings.selectModel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProviderModels.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. claude-opus-4-5" />
                  )}
                </div>
                {/* [AI:END] */}
                <div className="space-y-1">
                  <Label>{t("settings.maxTokens")}</Label>
                  <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.temperature")}</Label>
                  <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.maxToolIterations")}</Label>
                  <Input type="number" value={maxToolIter} onChange={(e) => setMaxToolIter(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.memoryWindow")}</Label>
                  <Input type="number" value={memoryWindow} onChange={(e) => setMemoryWindow(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.reasoningEffort")}</Label>
                  <Select value={reasoningEffort} onValueChange={setReasoningEffort}>
                    <SelectTrigger><SelectValue placeholder="— default —" /></SelectTrigger>
                    <SelectContent>
                      {REASONING_EFFORT_OPTIONS.map((e) => (
                        <SelectItem key={e} value={e}>{e === "__default__" ? "— default —" : e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.workspace")}</Label>
                  <Input value={workspace} onChange={(e) => setWorkspace(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSaveAgent} disabled={updateAgent.isPending}>{t("settings.save")}</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.gateway")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingGateway ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("settings.host")}</Label>
                  <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="0.0.0.0" />
                </div>
                <div className="space-y-1">
                  <Label>{t("settings.port")}</Label>
                  <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={heartbeatEnabled} onCheckedChange={setHeartbeatEnabled} id="hb-enabled" />
                <Label htmlFor="hb-enabled">{t("settings.heartbeat")}</Label>
              </div>
              {heartbeatEnabled && (
                <div className="space-y-1 max-w-xs">
                  <Label>{t("settings.heartbeatInterval")}</Label>
                  <Input type="number" value={heartbeatInterval} onChange={(e) => setHeartbeatInterval(e.target.value)} />
                </div>
              )}
              <Button onClick={handleSaveGateway} disabled={updateGateway.isPending}>{t("settings.save")}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Workspace files tab ───────────────────────────────────────────────────────

const WORKSPACE_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"];

const FILE_DESCRIPTIONS: Record<string, string> = {
  "AGENTS.md": "settings.wsFiles.agents",
  "SOUL.md": "settings.wsFiles.soul",
  "USER.md": "settings.wsFiles.user",
  "TOOLS.md": "settings.wsFiles.tools",
  "HEARTBEAT.md": "settings.wsFiles.heartbeat",
};

function WorkspaceFileEditor({ name }: { name: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkspaceFile(name);
  const save = useSaveWorkspaceFile();
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Reset when file changes
  if (data && content === null) {
    setContent(data.content);
    setDirty(false);
  }

  const handleChange = (v: string) => { setContent(v); setDirty(true); };

  const handleSave = () => {
    save.mutate({ name, content: content ?? "" }, {
      onSuccess: () => setDirty(false),
    });
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {isLoading ? (
        <Skeleton className="flex-1" />
      ) : (
        <>
          <Textarea
            value={content ?? ""}
            onChange={(e) => handleChange(e.target.value)}
            className="font-mono text-xs flex-1 min-h-[400px] resize-none"
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={save.isPending || !dirty}>
              {t("settings.save")}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">{t("settings.unsaved")}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function WorkspaceTab() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("AGENTS.md");

  return (
    <div className="flex gap-4 h-full">
      {/* Left nav */}
      <div className="w-44 shrink-0 flex flex-col gap-1">
        {WORKSPACE_FILES.map((name) => (
          <button
            key={name}
            onClick={() => setSelected(name)}
            className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
              selected === name
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <div className="text-sm font-mono font-medium leading-tight">{name}</div>
            <div className={`text-xs leading-tight mt-0.5 ${selected === name ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
              {t(FILE_DESCRIPTIONS[name])}
            </div>
          </button>
        ))}


      </div>

      {/* Right editor */}
      <div className="flex-1 min-w-0">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono">{selected}</CardTitle>
            <CardDescription className="text-xs">{t(FILE_DESCRIPTIONS[selected])}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col" style={{ height: "calc(100% - 72px)" }}>
            <WorkspaceFileEditor key={selected} name={selected} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "agent";

  return (
    <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}>
      <TabsList>
        <TabsTrigger value="agent">{t("nav.settings")}</TabsTrigger>
        <TabsTrigger value="providers">{t("nav.providers")}</TabsTrigger>
        <TabsTrigger value="workspace">{t("settings.workspaceFiles")}</TabsTrigger>
      </TabsList>
      <TabsContent value="agent" className="mt-4"><AgentTab /></TabsContent>
      <TabsContent value="providers" className="mt-4"><ProvidersTab /></TabsContent>
      <TabsContent value="workspace" className="mt-4"><WorkspaceTab /></TabsContent>
    </Tabs>
  );
}
