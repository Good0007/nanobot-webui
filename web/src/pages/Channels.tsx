import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useChannels, useUpdateChannel, useReloadChannel, useReloadAllChannels, useToggleChannel,
  useWeixinQrStart, useWeixinQrStatus,
} from "../hooks/useChannels";
import {
  Card,
  CardContent,
  CardHeader,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SecretInput } from "../components/shared/SecretInput";
import { StatusBadge } from "../components/shared/StatusBadge";
import { Skeleton } from "../components/ui/skeleton";
import { RefreshCw, ChevronDown, ChevronRight, QrCode, CheckCircle2, Clock } from "lucide-react";
import { isMasked } from "../lib/utils";
import { toast } from "sonner";

import { CHANNEL_ICONS } from "../lib/channelIcons";

const SECRET_FIELDS = new Set([
  "token", "appSecret", "secret", "imapPassword", "smtpPassword",
  "bridgeToken", "accessToken", "appToken", "botToken",
]);

function isSecretField(key: string): boolean {
  return SECRET_FIELDS.has(key);
}

// ---------------------------------------------------------------------------
// WeChat QR login panel
// ---------------------------------------------------------------------------

function WeixinQrPanel({ loggedIn, onLoginSuccess }: { loggedIn: boolean; onLoginSuccess: () => void }) {
  const { t } = useTranslation();
  const [qrcodeId, setQrcodeId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string>("");
  const [scanUrl, setScanUrl] = useState<string>("");
  const [done, setDone] = useState(false);

  const qrStart = useWeixinQrStart();
  const { data: qrStatus } = useWeixinQrStatus(qrcodeId);

  const handleConfirmed = useCallback(() => {
    setDone(true);
    setQrcodeId(null);
    toast.success(t("channels.weixin.confirmed"));
    onLoginSuccess();
  }, [t, onLoginSuccess]);

  useEffect(() => {
    if (qrStatus?.status === "confirmed") handleConfirmed();
    if (qrStatus?.status === "expired") setQrcodeId(null); // re-enable the login button
  }, [qrStatus?.status, handleConfirmed]);

  const startQr = async () => {
    setDone(false);
    setQrcodeId(null);
    try {
      const data = await qrStart.mutateAsync();
      setQrcodeId(data.qrcode_id);
      setQrImage(data.qr_image);
      setScanUrl(data.scan_url);
    } catch {
      toast.error(t("channels.weixin.startFailed"));
    }
  };

  const statusText = () => {
    if (qrStatus?.status === "scaned") return t("channels.weixin.scaned");
    return t("channels.weixin.waitScan");
  };

  return (
    <div className="rounded-lg border border-dashed p-4 space-y-3">
      {/* Login state header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {loggedIn || done ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-600 font-medium">{t("channels.weixin.loggedIn")}</span>
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("channels.weixin.notLoggedIn")}</span>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant={loggedIn || done ? "outline" : "default"}
          onClick={startQr}
          disabled={qrStart.isPending || !!qrcodeId}
        >
          <QrCode className="mr-1.5 h-3.5 w-3.5" />
          {loggedIn || done ? t("channels.weixin.relogin") : t("channels.weixin.qrLogin")}
        </Button>
      </div>

      {/* QR code display */}
      {qrcodeId && (
        <div className="flex flex-col items-center gap-2 pt-1">
          {qrImage ? (
            <img src={qrImage} alt="WeChat QR" className="w-40 h-40 rounded border" />
          ) : (
            <div className="w-40 h-40 rounded border flex items-center justify-center bg-muted text-xs text-center p-2 break-all">
              {scanUrl}
            </div>
          )}
          <p className={`text-xs ${qrStatus?.status === "scaned" ? "text-green-600" : "text-muted-foreground"}`}>
            {statusText()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Channels() {
  const { t } = useTranslation();
  const { data: channels, isLoading } = useChannels();
  const update = useUpdateChannel();
  const reload = useReloadChannel();
  const reloadAll = useReloadAllChannels();
  const toggle = useToggleChannel();

  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<string[]>([]);

  const getDraft = (ch: string, field: string, original: string) =>
    drafts[ch]?.[field] ?? original;

  const setDraft = (ch: string, field: string, value: string) =>
    setDrafts((p) => ({
      ...p,
      [ch]: { ...(p[ch] ?? {}), [field]: value },
    }));

  const handleSave = (name: string, config: Record<string, unknown>) => {
    const draft = drafts[name] ?? {};
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...config, ...draft })) {
      if (k === "enabled" || k === "loggedIn") continue;
      if (typeof v === "boolean") {
        payload[k] = String(v);
      } else if (typeof v === "string" && !isMasked(v)) {
        payload[k] = v;
      }
    }
    update.mutate({ name, data: { config: payload } });
  };

  const toggleExpand = (name: string) =>
    setExpanded((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => reloadAll.mutate()}
          disabled={reloadAll.isPending}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("channels.reloadAll")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {channels?.map((ch) => {
            const isExpand = expanded.includes(ch.name);
            const icon = CHANNEL_ICONS[ch.name] ?? "📡";
            const configEntries = Object.entries(ch.config ?? {}).filter(
              ([k, v]) => k !== "enabled" && k !== "loggedIn" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || Array.isArray(v))
            );
            return (
              <Card key={ch.name} className={ch.enabled ? "" : "opacity-60"}>
                <CardHeader className="flex flex-row items-center gap-3 py-3 px-4">
                  {/* Channel icon + name */}
                  <button
                    className="flex flex-1 items-center gap-3 text-left"
                    onClick={() => toggleExpand(ch.name)}
                  >
                    <span className="text-xl leading-none">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{t(`channels.names.${ch.name}`, { defaultValue: ch.name })}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge running={ch.running} error={ch.error} />
                      {isExpand
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </button>

                  {/* Enable/Disable switch */}
                  <div className="flex items-center gap-2 shrink-0 pl-2 border-l" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={ch.enabled}
                      onCheckedChange={(val) => toggle.mutate({ name: ch.name, enabled: val })}
                      disabled={toggle.isPending}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); reload.mutate(ch.name); }}
                      disabled={reload.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                {isExpand && (
                  <CardContent className="space-y-3 pt-0 pb-4">
                    {ch.error && (
                      <p className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {ch.error}
                      </p>
                    )}

                    {/* WeChat: QR code login panel (shown before config fields) */}
                    {ch.name === "weixin" && (
                      <WeixinQrPanel
                        loggedIn={ch.config?.loggedIn === true}
                        onLoginSuccess={() => reload.mutate(ch.name)}
                      />
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {configEntries.map(([k, v]) => {
                        const strVal = Array.isArray(v) ? v.join(", ") : String(v);
                        const draftVal = getDraft(ch.name, k, strVal);
                        const isBool = typeof v === "boolean";
                        const isArray = Array.isArray(v);
                        return (
                          <div key={k} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t(`channels.fields.${k}`, { defaultValue: k })}
                            </Label>
                            {isBool ? (
                              <Select
                                value={draftVal}
                                onValueChange={(val) => setDraft(ch.name, k, val)}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">{t("common.yes")}</SelectItem>
                                  <SelectItem value="false">{t("common.no")}</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : isArray ? (
                              <Input
                                value={draftVal}
                                onChange={(e) => setDraft(ch.name, k, e.target.value)}
                                className="text-sm"
                                placeholder="ID1, ID2, ..."
                              />
                            ) : isSecretField(k) ? (
                              <SecretInput
                                value={draftVal}
                                onChange={(val) => setDraft(ch.name, k, val)}
                              />
                            ) : (
                              <Input
                                value={draftVal}
                                onChange={(e) => setDraft(ch.name, k, e.target.value)}
                                className="text-sm"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {configEntries.length > 0 && (
                      <div className="flex justify-end sm:justify-start">
                        <Button
                          size="sm"
                          onClick={() => handleSave(ch.name, ch.config)}
                          disabled={update.isPending}
                        >
                          {t("channels.save")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


