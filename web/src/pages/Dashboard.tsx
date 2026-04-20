import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useChannels } from "../hooks/useChannels";
import { useSkills } from "../hooks/useSkills";
import { useCronJobs } from "../hooks/useCron";
import { useSessions } from "../hooks/useSessions";
import { useVersion, useUpdatePackages } from "../hooks/useVersion";
import { useAuthStore } from "../stores/authStore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";
import { Radio, Wrench, Clock, MessageSquare, AlertCircle, CheckCircle2, XCircle, RefreshCw, PackageCheck } from "lucide-react";
import { cn } from "../lib/utils";

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: channels, isLoading: loadingChannels } = useChannels();
  const { data: skills, isLoading: loadingSkills } = useSkills();
  const { data: cron, isLoading: loadingCron } = useCronJobs();
  const { data: sessions, isLoading: loadingSessions } = useSessions();
  const { data: versionInfo, isLoading: loadingVersion, refetch: refetchVersion } = useVersion();
  const updatePackages = useUpdatePackages();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const runningChannels = channels?.filter((c) => c.running).length ?? 0;
  const totalChannels = channels?.length ?? 0;
  const activeSkills = skills?.filter((s) => s.available && s.enabled).length ?? 0;
  const enabledCron = cron?.filter((j) => j.enabled).length ?? 0;
  const totalSessions = sessions?.length ?? 0;

  const stats = [
    {
      label: t("dashboard.channels"),
      value: loadingChannels ? null : `${runningChannels} / ${totalChannels}`,
      icon: Radio,
      sub: t("dashboard.running"),
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50 dark:bg-blue-950/50",
    },
    {
      label: t("dashboard.skills"),
      value: loadingSkills ? null : `${activeSkills}`,
      icon: Wrench,
      sub: t("dashboard.active"),
      iconColor: "text-sky-500",
      iconBg: "bg-sky-50 dark:bg-sky-950/50",
    },
    {
      label: t("dashboard.cronJobs"),
      value: loadingCron ? null : `${enabledCron}`,
      icon: Clock,
      sub: t("dashboard.active"),
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50 dark:bg-amber-950/50",
    },
    {
      label: t("dashboard.sessions"),
      value: loadingSessions ? null : `${totalSessions}`,
      icon: MessageSquare,
      sub: t("dashboard.active"),
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards — 2 cols on mobile, 4 cols on desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="overflow-hidden">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground leading-snug truncate">{stat.label}</p>
                    {stat.value === null ? (
                      <Skeleton className="mt-1.5 h-7 w-12" />
                    ) : (
                      <div className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{stat.value}</div>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</p>
                  </div>
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", stat.iconBg)}>
                    <Icon className={cn("h-4 w-4", stat.iconColor)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Channel cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5 sm:px-6 sm:pb-3">
          <CardTitle className="text-sm sm:text-base">{t("dashboard.channels")}</CardTitle>
          <Link to="/channels" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("dashboard.manageChannels")}
          </Link>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6">
          {loadingChannels ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !channels || channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {channels.map((ch) => {
                const isRunning = ch.running;
                const hasError = !!ch.error;
                return (
                  <div
                    key={ch.name}
                    className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
                      hasError
                        ? "border-destructive/40 bg-destructive/5"
                        : isRunning
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-sm font-semibold leading-tight break-all">{t(`channels.names.${ch.name}`, { defaultValue: ch.name })}</span>
                      {hasError ? (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      ) : isRunning ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={ch.enabled ? "default" : "secondary"} className="text-xs px-1.5 py-0">
                        {ch.enabled ? t("channels.enabled") : t("channels.disabled")}
                      </Badge>
                      {hasError ? (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">
                          {t("dashboard.error")}
                        </Badge>
                      ) : (
                        <Badge
                          variant={isRunning ? "default" : "secondary"}
                          className={`text-xs px-1.5 py-0 ${isRunning ? "bg-green-500 hover:bg-green-600 text-white" : ""}`}
                        >
                          {isRunning ? t("dashboard.running") : t("dashboard.stopped")}
                        </Badge>
                      )}
                    </div>

                    {/* Error message */}
                    {hasError && (
                      <p className="text-xs text-destructive leading-tight line-clamp-2">{ch.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Version info card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2.5 sm:px-6 sm:pb-3">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.version.title")}
          </CardTitle>
          <button
            onClick={() => refetchVersion()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            disabled={loadingVersion}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingVersion && "animate-spin")} />
          </button>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:px-6">
          {loadingVersion ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-48" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  { key: "nanobot_webui", label: "nanobot-webui" },
                  { key: "nanobot", label: "nanobot-ai" },
                ] as const).map(({ key, label }) => {
                  const pkg = versionInfo?.[key];
                  const hasUpdate = pkg?.latest && pkg.current !== "unknown" && pkg.latest !== pkg.current;
                  return (
                    <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2 gap-2">
                      <span className="font-mono text-sm font-medium">{label}</span>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-sm text-muted-foreground font-mono">
                          {pkg?.current ?? t("dashboard.version.unknown")}
                        </span>
                        {pkg?.latest === null ? null : hasUpdate ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 px-1.5 py-0">
                            → {pkg?.latest}
                          </Badge>
                        ) : pkg?.latest ? (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {t("dashboard.version.upToDate")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {isAdmin && !!versionInfo && [
                versionInfo.nanobot_webui,
                versionInfo.nanobot,
              ].some(
                (pkg) => pkg?.latest && pkg.current !== "unknown" && pkg.latest !== pkg.current
              ) && (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatePackages.isPending}
                    onClick={() =>
                      updatePackages.mutate(undefined, {
                        onSuccess: () => toast.success(t("dashboard.version.updateSuccess")),
                        onError: (e: unknown) => toast.error(
                          t("dashboard.version.updateFailed") + ": " +
                          ((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(e))
                        ),
                      })
                    }
                  >
                    {updatePackages.isPending ? (
                      <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />{t("dashboard.version.updating")}</>
                    ) : (
                      t("dashboard.version.update")
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("dashboard.version.updateHint")}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
