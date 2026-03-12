import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useProviders, useUpdateProvider, getProviderLabel, getProviderDefaultBaseUrl } from "../../hooks/useProviders";
import { useAgentSettings, useUpdateAgentSettings } from "../../hooks/useConfig";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { AlertCircle, ArrowRight, ArrowLeft, CheckCircle2, Key, X } from "lucide-react";

export function SetupGuideDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: providers } = useProviders();
  const { data: agentSettings } = useAgentSettings();
  const updateProvider = useUpdateProvider();
  const updateAgent = useUpdateAgentSettings();
  
  // 配置步骤：0=欢迎, 1=配置提供商
  const [step, setStep] = useState(0);
  
  // 提供商配置
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");

  // 使用 useMemo 计算是否应该显示引导
  const shouldShowGuide = useMemo(() => {
    // 等待数据加载完成
    if (!providers || !agentSettings) return false;

    // 检查是否有配置的提供商
    const hasConfiguredProvider = providers.some((p) => p.has_key);
    
    // 检查是否配置了代理设置（provider 和 model）
    const hasAgentConfig = agentSettings.provider && agentSettings.model;

    // 如果没有配置提供商或没有配置代理，显示引导
    return !hasConfiguredProvider || !hasAgentConfig;
  }, [providers, agentSettings]);

  const handleAddModel = () => {
    const trimmed = newModel.trim();
    if (trimmed && !models.includes(trimmed)) {
      setModels([...models, trimmed]);
      setNewModel("");
    }
  };

  const handleSaveProvider = async () => {
    if (!apiKey.trim()) {
      toast.error(t("providers.apiKeyRequired"));
      return;
    }
    if (models.length === 0) {
      toast.error(t("providers.modelsRequired"));
      return;
    }

    try {
      await updateProvider.mutateAsync({
        name: selectedProvider,
        api_key: apiKey,
        api_base: apiBase || undefined,
        models,
      });
      // 自动将 agent 设为当前供应商 + 模型列表第一个，用户无需再选
      await updateAgent.mutateAsync({
        provider: selectedProvider,
        model: models[0],
      });
      toast.success(t("setupGuide.setupComplete"));
      navigate("/dashboard");
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleClose = () => {
    // 只有在已经有配置的情况下才允许关闭
    const hasConfiguredProvider = providers?.some((p) => p.has_key) ?? false;
    const hasAgentConfig = agentSettings?.provider && agentSettings?.model;
    
    if (hasConfiguredProvider && hasAgentConfig) {
      navigate("/dashboard");
    } else {
      toast.warning(t("setupGuide.mustComplete"));
    }
  };

  if (!shouldShowGuide) return null;

  // 供选择的提供商列表（所有支持的提供商）
  const allProviders = [
    "openai",
    "anthropic", 
    "openrouter",
    "deepseek",
    "groq",
    "zhipu",
    "dashscope",
    "gemini",
    "moonshot",
    "minimax",
    "aihubmix",
    "siliconflow",
    "volcengine",
    "azure_openai",
    "vllm",
    "custom",
  ];

  return (
    <Dialog open={shouldShowGuide} onOpenChange={() => handleClose()}>
      <DialogContent 
        className="sm:max-w-lg" 
        onPointerDownOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
              {step === 0 && <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />}
              {step === 1 && <Key className="h-5 w-5 text-orange-600 dark:text-orange-400" />}
            </div>
            <DialogTitle>
              {step === 0 && t("setupGuide.title")}
              {step === 1 && t("setupGuide.step1Title")}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {step === 0 && t("setupGuide.description")}
            {step === 1 && t("setupGuide.step1Description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 步骤0: 欢迎页面 */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-lg border p-3 bg-orange-50/50 dark:bg-orange-950/20">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                    <span className="text-sm font-semibold text-orange-600">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t("setupGuide.step1Title")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("setupGuide.step1Description")}</p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep(1)} className="gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
                  {t("setupGuide.startSetup")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* 步骤1: 配置提供商 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>{t("settings.provider")}</Label>
                  <Select value={selectedProvider} onValueChange={(val) => {
                    setSelectedProvider(val);
                    setApiBase(getProviderDefaultBaseUrl(val) || "");
                  }}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allProviders.map((p) => (
                        <SelectItem key={p} value={p}>
                          {getProviderLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("providers.apiKey")}</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t("providers.apiKeyPlaceholder")}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>{t("providers.apiBase")}</Label>
                  <Input
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder={getProviderDefaultBaseUrl(selectedProvider) || ""}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    {t("providers.models")} <span className="text-destructive">*</span>
                  </Label>
                  <div
                    className="flex flex-wrap items-center gap-1.5 min-h-[36px] mt-1.5 p-2 rounded-md border bg-background cursor-text"
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
                          onClick={() => setModels(models.filter((x) => x !== m))}
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
                        if (e.key === "Enter") { e.preventDefault(); handleAddModel(); }
                        if (e.key === "Backspace" && !newModel && models.length > 0) {
                          setModels(models.slice(0, -1));
                        }
                      }}
                      onBlur={handleAddModel}
                      placeholder={models.length === 0 ? t("providers.modelsPlaceholder") : ""}
                      className="flex-1 min-w-[120px] bg-transparent text-xs font-mono outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("common.back")}
                </Button>
                <Button onClick={handleSaveProvider} disabled={updateProvider.isPending || updateAgent.isPending} className="gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700">
                  {(updateProvider.isPending || updateAgent.isPending) ? t("common.saving") : t("setupGuide.complete")}
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
