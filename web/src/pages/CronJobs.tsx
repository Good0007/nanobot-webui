import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useCronJobs,
  useCreateCronJob,
  useUpdateCronJob,
  useDeleteCronJob,
  useToggleCronJob,
  useCronSessions,
  useCronSessionMessages,
  type CronJob,
  type CronJobRequest,
  type CronSchedule,
  type CronScheduleKind,
  type CronSession,
  type CronSessionMessage,
} from "../hooks/useCron";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { Skeleton } from "../components/ui/skeleton";
import { Plus, Pencil, Trash2, ArrowLeft, Clock, MessageSquare, Bot, User, Wrench, Search, History } from "lucide-react";
import { formatDate } from "../lib/utils";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Session key ↔ URL sid helpers.
 *  URLSearchParams already handles percent-encoding, so we just pass
 *  the raw key through.  The URL will show e.g. `sid=cron:my_job`. */
function keyToSid(key: string): string {
  return key;
}

function sidToKey(sid: string): string {
  return sid;
}

/** Human-readable description of a schedule */
function scheduleLabel(s: CronSchedule, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (s.kind) {
    case "cron":
      return s.expr ?? "—";
    case "every": {
      if (!s.every_ms) return "—";
      const secs = s.every_ms / 1000;
      if (secs < 60) return t("cron.everySeconds", { n: secs });
      const mins = secs / 60;
      if (mins < 60) return t("cron.everyMinutes", { n: mins });
      const hrs = mins / 60;
      return t("cron.everyHours", { n: hrs });
    }
    case "at":
      return s.at_ms ? new Date(s.at_ms).toLocaleString() : "—";
    default:
      return "—";
  }
}

/** Format millisecond timestamp */
function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

// ---------------------------------------------------------------------------
// CronForm – supports kind (cron / every / at) schedule types
// ---------------------------------------------------------------------------

function CronForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: CronJob;
  onSave: (data: CronJobRequest) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<CronScheduleKind>(initial?.schedule.kind ?? "cron");
  const [expr, setExpr] = useState(initial?.schedule.expr ?? "0 * * * *");
  const [everyMs, setEveryMs] = useState<number>(initial?.schedule.every_ms ?? 3600000);
  const [atMs, setAtMs] = useState<string>(
    initial?.schedule.at_ms ? new Date(initial.schedule.at_ms).toISOString().slice(0, 16) : ""
  );
  const [tz, setTz] = useState(initial?.schedule.tz ?? "");
  const [message, setMessage] = useState(initial?.payload.message ?? "");
  const [deliver, setDeliver] = useState(initial?.payload.deliver ?? false);
  const [channel, setChannel] = useState(initial?.payload.channel ?? "");
  const [to, setTo] = useState(initial?.payload.to ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [deleteAfterRun, setDeleteAfterRun] = useState(initial?.delete_after_run ?? false);

  const handleSave = () => {
    const schedule: CronSchedule = { kind };
    if (kind === "cron") {
      schedule.expr = expr;
      if (tz) schedule.tz = tz;
    } else if (kind === "every") {
      schedule.every_ms = everyMs;
    } else if (kind === "at") {
      schedule.at_ms = atMs ? new Date(atMs).getTime() : undefined;
    }

    onSave({
      name,
      enabled,
      schedule,
      payload: { message, deliver, channel, to },
      delete_after_run: deleteAfterRun,
    });
  };

  return (
    <>
      <div className="space-y-4 py-2">
        {/* Name */}
        <div className="space-y-1">
          <Label>{t("cron.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Schedule kind */}
        <div className="space-y-2">
          <Label>{t("cron.schedule")}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as CronScheduleKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cron">{t("cron.kindCron")}</SelectItem>
              <SelectItem value="every">{t("cron.kindEvery")}</SelectItem>
              <SelectItem value="at">{t("cron.kindAt")}</SelectItem>
            </SelectContent>
          </Select>

          {kind === "cron" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("cron.kindCronLabel")}</Label>
                <Input
                  className="font-mono text-sm h-8"
                  value={expr}
                  onChange={(e) => setExpr(e.target.value)}
                  placeholder="0 * * * *"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t("cron.kindCronFormat")}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("cron.timezone")}</Label>
                <Input
                  className="text-sm h-8"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="Asia/Shanghai"
                />
              </div>
            </div>
          )}

          {kind === "every" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("cron.intervalMinutes")}</Label>
              <Input
                type="number"
                min={1}
                className="font-mono text-sm h-8"
                value={everyMs / 60000}
                onChange={(e) => setEveryMs(Number(e.target.value) * 60000)}
              />
            </div>
          )}

          {kind === "at" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("cron.runAt")}</Label>
              <Input
                type="datetime-local"
                className="text-sm h-8"
                value={atMs}
                onChange={(e) => setAtMs(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Message */}
        <div className="space-y-1">
          <Label>{t("cron.message")}</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
        </div>

        {/* Deliver to channel */}
        <div className="flex items-center gap-3">
          <Switch checked={deliver} onCheckedChange={setDeliver} id="deliver" />
          <Label htmlFor="deliver">{t("cron.deliverToChannel")}</Label>
        </div>
        {deliver && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("cron.channel")}</Label>
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="telegram" />
            </div>
            <div className="space-y-1">
              <Label>{t("cron.to")}</Label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="chat_id" />
            </div>
          </div>
        )}

        {/* Enabled & Delete after run */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="enabled" />
            <Label htmlFor="enabled">{enabled ? t("cron.enabled") : t("cron.disabled")}</Label>
          </div>
          {kind === "at" && (
            <div className="flex items-center gap-3">
              <Switch checked={deleteAfterRun} onCheckedChange={setDeleteAfterRun} id="delAfterRun" />
              <Label htmlFor="delAfterRun">{t("cron.deleteAfterRun")}</Label>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={handleSave} disabled={!name || !message}>{t("cron.save")}</Button>
      </DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// JobsTab – the original job-management table
// ---------------------------------------------------------------------------

function JobsTab({
  highlightJobId,
  onViewSession,
}: {
  highlightJobId?: string | null;
  onViewSession?: (sessionKey: string) => void;
}) {
  const { t } = useTranslation();
  const { data: jobs, isLoading } = useCronJobs();
  const create = useCreateCronJob();
  const update = useUpdateCronJob();
  const del = useDeleteCronJob();
  const toggle = useToggleCronJob();

  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<CronJob | null>(null);
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [showDisabled, setShowDisabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const now = Date.now();

  // Classify each job
  type JobCategory = "active" | "expired" | "disabled";
  const categorize = (j: CronJob): JobCategory => {
    if (!j.enabled) return "disabled";
    if (j.schedule.kind === "at" && j.schedule.at_ms && j.schedule.at_ms < now) return "expired";
    return "active";
  };

  // Build sorted list: active → expired → disabled (disabled only if showDisabled)
  const allJobs = jobs ?? [];
  const lowerQuery = searchQuery.toLowerCase().trim();
  const sortedJobs = [...allJobs]
    .map((j) => ({ job: j, cat: categorize(j) }))
    .filter(({ job, cat }) => {
      if (cat === "disabled" && !showDisabled) return false;
      if (lowerQuery && !job.name.toLowerCase().includes(lowerQuery)) return false;
      return true;
    })
    .sort((a, b) => {
      const order: Record<JobCategory, number> = { active: 0, expired: 1, disabled: 2 };
      return order[a.cat] - order[b.cat];
    });

  const disabledCount = allJobs.filter((j) => !j.enabled).length;

  // Auto-show disabled if highlightJobId points to a disabled job
  const highlightIsDisabled = highlightJobId
    ? allJobs.some((j) => j.id === highlightJobId && !j.enabled)
    : false;
  if (highlightIsDisabled && !showDisabled) {
    setShowDisabled(true);
  }

  // Status helpers
  const jobStatusLabel = (_j: CronJob, cat: JobCategory): string => {
    if (cat === "disabled") return t("cron.disabled");
    if (cat === "expired") return t("cron.expired");
    return t("cron.enabled");
  };

  const jobStatusVariant = (_j: CronJob, cat: JobCategory): "default" | "secondary" | "outline" => {
    if (cat === "disabled") return "secondary";
    if (cat === "expired") return "outline";
    return "default";
  };

  const handleSave = (data: CronJobRequest) => {
    if (mode === "create") {
      create.mutate(data);
    } else if (editTarget) {
      update.mutate({ id: editTarget.id, ...data });
    }
    setMode(null);
  };

  return (
    <div className="space-y-4">
      {/* Top bar: show disabled switch + search + add button */}
      <div className="flex items-center justify-between gap-3">
        {disabledCount > 0 ? (
          <div className="flex items-center gap-2">
            <Switch
              id="show-disabled"
              checked={showDisabled}
              onCheckedChange={setShowDisabled}
            />
            <Label htmlFor="show-disabled" className="text-sm text-muted-foreground cursor-pointer">
              {t("cron.showDisabled")}
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {disabledCount}
              </Badge>
            </Label>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("common.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 pl-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => { setEditTarget(null); setMode("create"); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("cron.add")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cron.name")}</TableHead>
                <TableHead>{t("cron.schedule")}</TableHead>
                <TableHead>{t("cron.nextRun")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="w-40 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedJobs.map(({ job: j, cat }) => (
                <TableRow
                  key={j.id}
                  className={cn(
                    highlightJobId === j.id && "bg-primary/10 ring-1 ring-primary/30",
                    cat === "disabled" && "opacity-60"
                  )}
                >
                  <TableCell className="font-medium">{j.name}</TableCell>
                  <TableCell className="font-mono text-xs">{scheduleLabel(j.schedule, t)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {cat === "active"
                      ? fmtMs(j.state.next_run_at_ms)
                      : fmtMs(j.state.last_run_at_ms)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={jobStatusVariant(j, cat)}
                      className={cat === "expired" ? "text-muted-foreground" : ""}
                    >
                      {jobStatusLabel(j, cat)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {/* Toggle enable/disable */}
                    {cat === "disabled" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggle.mutate({ id: j.id, enabled: true })}
                      >
                        {t("cron.enable")}
                      </Button>
                    ) : cat === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggle.mutate({ id: j.id, enabled: false })}
                      >
                        {t("cron.disable")}
                      </Button>
                    ) : null}
                    {/* History */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onViewSession?.(j.id)}
                    >
                      <History className="mr-1 h-3.5 w-3.5" />
                      {t("cron.history")}
                    </Button>
                    {/* Edit */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => { setEditTarget(j); setMode("edit"); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {/* Delete */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDelTarget(j.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">{t("common.noData")}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!mode} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? t("cron.add") : t("cron.edit")}</DialogTitle>
          </DialogHeader>
          <CronForm
            initial={editTarget ?? undefined}
            onSave={handleSave}
            onClose={() => setMode(null)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!delTarget}
        title={t("cron.delete")}
        description={t("cron.deleteConfirm")}
        destructive
        onConfirm={() => { if (delTarget) del.mutate(delTarget); setDelTarget(null); }}
        onCancel={() => setDelTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble component
// ---------------------------------------------------------------------------

function roleIcon(role: string) {
  switch (role) {
    case "user":
      return <User className="h-4 w-4" />;
    case "assistant":
      return <Bot className="h-4 w-4" />;
    case "tool":
      return <Wrench className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
}

function roleBgClass(role: string) {
  switch (role) {
    case "user":
      return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
    case "assistant":
      return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
    case "tool":
      return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    default:
      return "bg-muted border-border";
  }
}

function MessageBubble({ msg, t }: { msg: CronSessionMessage; t: (k: string) => string }) {
  const contentStr =
    typeof msg.content === "string"
      ? msg.content
      : msg.content != null
        ? JSON.stringify(msg.content, null, 2)
        : null;

  const roleLabel =
    msg.role === "user"
      ? t("cron.roleUser")
      : msg.role === "assistant"
        ? t("cron.roleAssistant")
        : msg.role === "tool"
          ? t("cron.roleTool")
          : msg.role;

  return (
    <div className={cn("rounded-lg border p-3 text-sm", roleBgClass(msg.role))}>
      <div className="flex items-center gap-2 mb-1.5">
        {roleIcon(msg.role)}
        <span className="font-medium text-xs uppercase tracking-wide">{roleLabel}</span>
        {msg.name && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {msg.name}
          </Badge>
        )}
        {msg.timestamp && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatDate(msg.timestamp)}
          </span>
        )}
      </div>

      {/* Tool call info */}
      {msg.tool_calls && msg.tool_calls.length > 0 && (
        <div className="mb-1.5 space-y-1">
          {(msg.tool_calls as Array<Record<string, unknown>>).map((tc, i) => {
            const fn = tc.function as Record<string, unknown> | undefined;
            const fnName = (fn?.name as string) ?? "tool";
            const fnArgs = fn?.arguments as string | object | undefined;
            const argsStr = fnArgs
              ? typeof fnArgs === "string" ? fnArgs.slice(0, 200) : JSON.stringify(fnArgs).slice(0, 200)
              : null;
            return (
              <div key={i} className="rounded bg-background/60 px-2 py-1 font-mono text-xs">
                <span className="text-primary font-semibold">{fnName}</span>
                {argsStr && (
                  <span className="text-muted-foreground ml-1 break-all">
                    ({argsStr})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {msg.tool_call_id && (
        <div className="text-[10px] text-muted-foreground mb-1 font-mono">
          {t("cron.toolCallResult")}: {msg.tool_call_id}
        </div>
      )}

      {contentStr && (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {contentStr.length > 2000 ? contentStr.slice(0, 2000) + "…" : contentStr}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session detail view (messages)
// ---------------------------------------------------------------------------

function SessionDetail({
  sessionKey,
  onBack,
  onNavigateToJob,
}: {
  sessionKey: string;
  onBack: () => void;
  onNavigateToJob: (jobId: string) => void;
}) {
  const { t } = useTranslation();
  const { data: messages, isLoading } = useCronSessionMessages(sessionKey);

  // Extract job ID from session key: "cron:my_job_id" or "cron:my_job_id:1234567890" → "my_job_id"
  const jobId = (() => {
    const rest = sessionKey.replace(/^cron:/, "");
    // New format: job_id:timestamp – strip the last colon-separated segment if it looks like a timestamp
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > 0) {
      const tail = rest.slice(lastColon + 1);
      if (/^\d+$/.test(tail)) return rest.slice(0, lastColon);
    }
    return rest;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("cron.backToList")}
        </Button>
        <div className="text-sm font-medium">
          {t("cron.messages")} —{" "}
          <button
            type="button"
            className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-primary underline underline-offset-2 hover:text-primary/80 cursor-pointer"
            onClick={() => onNavigateToJob(jobId)}
            title={t("cron.goToJob")}
          >
            {jobId}
          </button>
        </div>
        {messages && (
          <Badge variant="outline" className="ml-auto">
            {messages.length} {t("cron.messages").toLowerCase()}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : messages && messages.length > 0 ? (
        <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} t={t} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
          {t("cron.noMessages")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryTab – session list + drill-down to messages
// ---------------------------------------------------------------------------

function HistoryTab({
  selectedKey,
  onSelectKey,
  onNavigateToJob,
  filterJobId,
  onClearFilter,
}: {
  selectedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onNavigateToJob: (jobId: string) => void;
  filterJobId: string | null;
  onClearFilter: () => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  // Use the server-side filtering via query params
  const { data: sessions, isLoading } = useCronSessions({
    jobId: filterJobId,
    search: searchQuery.trim() || null,
  });

  // Helper: extract a human-readable label from a session key
  const sessionLabel = (key: string) => {
    const rest = key.replace(/^cron:/, "");
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > 0) {
      const tail = rest.slice(lastColon + 1);
      if (/^\d+$/.test(tail)) {
        const jobPart = rest.slice(0, lastColon);
        const ts = parseInt(tail, 10);
        return { jobId: jobPart, executedAt: new Date(ts).toLocaleString() };
      }
    }
    return { jobId: rest, executedAt: null };
  };

  if (selectedKey) {
    return (
      <SessionDetail
        sessionKey={selectedKey}
        onBack={() => onSelectKey(null)}
        onNavigateToJob={onNavigateToJob}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar: filter badge + search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {filterJobId && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {t("cron.filteredByJob")}: <span className="font-mono">{filterJobId}</span>
              <button
                type="button"
                className="ml-1 hover:text-destructive"
                onClick={onClearFilter}
              >
                ×
              </button>
            </Badge>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("cron.searchSessions")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-56 pl-8 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : sessions && sessions.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cron.jobId")}</TableHead>
                <TableHead>{t("cron.executedAt")}</TableHead>
                <TableHead>{t("cron.lastMessage")}</TableHead>
                <TableHead>{t("cron.updatedAt")}</TableHead>
                <TableHead className="w-24 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s: CronSession) => {
                  const label = sessionLabel(s.key);
                  return (
                    <TableRow
                      key={s.key}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectKey(s.key)}
                    >
                      <TableCell className="font-mono text-xs font-medium">{label.jobId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {label.executedAt || (s.created_at ? formatDate(s.created_at) : "-")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {s.last_message || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.updated_at ? formatDate(s.updated_at) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); onSelectKey(s.key); }}
                        >
                          <MessageSquare className="mr-1 h-3.5 w-3.5" />
                          {t("cron.viewMessages")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
          {t("cron.noSessions")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CronJobs page with tabs
// ---------------------------------------------------------------------------

export default function CronJobs() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read tab & sid from URL: /cron?tab=history&sid=cron_2d4e8598
  const tab = searchParams.get("tab") === "history" ? "history" : "jobs";
  const rawSid = searchParams.get("sid");
  // Convert URL sid (cron_xxx) back to session key (cron:xxx) for API use
  const selectedSessionKey = rawSid ? sidToKey(rawSid) : null;
  // Read highlighted job id (for navigating from Messages → Jobs tab)
  const highlightJobId = searchParams.get("job") || null;
  // Read filter_job (for filtering history by job)
  const filterJobId = searchParams.get("filter_job") || null;

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", value);
        if (value !== "history") {
          next.delete("sid");
          next.delete("filter_job");
        }
        if (value !== "jobs") {
          next.delete("job");
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const handleNavigateToJob = useCallback((jobId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "jobs");
      next.set("job", jobId);
      next.delete("sid");
      next.delete("filter_job");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSelectSession = useCallback(
    (key: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "history");
        if (key) {
          // Store as cron_xxx format in URL
          next.set("sid", keyToSid(key));
        } else {
          next.delete("sid");
        }
        next.delete("job");
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  // When clicking "History" from the Jobs tab, navigate to history tab with job filter
  const handleViewHistoryFromJobs = useCallback(
    (jobId: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "history");
        next.set("filter_job", jobId);
        next.delete("sid");
        next.delete("job");
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const handleClearJobFilter = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("filter_job");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="jobs">
          <Clock className="mr-1.5 h-4 w-4" />
          {t("cron.tabJobs")}
        </TabsTrigger>
        <TabsTrigger value="history">
          <History className="mr-1.5 h-4 w-4" />
          {t("cron.tabHistory")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="jobs">
        <JobsTab highlightJobId={highlightJobId} onViewSession={handleViewHistoryFromJobs} />
      </TabsContent>
      <TabsContent value="history">
        <HistoryTab
          selectedKey={selectedSessionKey}
          onSelectKey={handleSelectSession}
          onNavigateToJob={handleNavigateToJob}
          filterJobId={filterJobId}
          onClearFilter={handleClearJobFilter}
        />
      </TabsContent>
    </Tabs>
  );
}
