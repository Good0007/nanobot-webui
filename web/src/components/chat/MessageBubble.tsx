import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { ChatMessage } from "../../stores/chatStore";
import { ToolCallCard } from "./ToolCallCard";
import { ThinkingBlock } from "./ThinkingBlock";
import { useAuthStore } from "../../stores/authStore";
import { Info, ChevronDown, ChevronRight, CheckCircle2, XCircle, Bot, Copy, Check, Undo2, X } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  onRevoke?: (messageId: string) => void;
}

function splitThinking(content: string): { type: "text" | "thinking"; content: string }[] {
  const parts: { type: "text" | "thinking"; content: string }[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "thinking", content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }
  return parts;
}

/** SubAgent tool-call progress block — indigo tinted, visually distinct from main agent tools */
function SubAgentProgressBlock({ message }: { message: ChatMessage }) {
  const isError = message.content.startsWith("Error:");
  // Strip the leading "[↳ label] " prefix for the header display
  const match = message.content.match(/^\[↳ (.+?)\] (.+)$/);
  const label = match?.[1] ?? "SubAgent";
  const hint = match?.[2] ?? message.content;
  const isLong = hint.length > 300;
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden",
      isError
        ? "border-red-200/70 bg-red-50/40 dark:border-red-800/40 dark:bg-red-950/15"
        : "border-indigo-200/60 bg-indigo-50/40 dark:border-indigo-800/30 dark:bg-indigo-950/20"
    )}>
      <button
        onClick={() => isLong && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left rounded-lg transition-colors",
          isLong && "hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 cursor-pointer",
          !isLong && "cursor-default"
        )}
      >
        <Bot className="h-3 w-3 shrink-0 text-indigo-400 dark:text-indigo-400" />
        <span className="font-medium text-indigo-500/80 dark:text-indigo-400/80 truncate max-w-[80px]">
          {label}
        </span>
        <span className="text-muted-foreground/50">·</span>
        {isError
          ? <XCircle className="h-3 w-3 shrink-0 text-red-500" />
          : <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
        <span className="font-mono font-medium text-foreground/70 truncate">
          {hint}
        </span>
        <span className="ml-auto mr-1 shrink-0 text-[10px] text-muted-foreground/40">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isLong && (
          open
            ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {(open || !isLong) && hint.length > 80 && (
        <div className="border-t border-indigo-200/40 dark:border-indigo-800/30 px-3 py-2">
          <pre className={cn(
            "max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed",
            isError ? "text-red-700/80 dark:text-red-300/70" : "text-muted-foreground/80"
          )}>
            {hint}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Tool execution result block — clean slate style, collapsible */
function ToolResultBlock({ message }: { message: ChatMessage }) {
  const isError = message.content.startsWith("Error:");
  const isLong = message.content.length > 300;
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden",
      isError
        ? "border-red-200/70 bg-red-50/40 dark:border-red-800/40 dark:bg-red-950/15"
        : "border-border/60 bg-muted/30 dark:bg-muted/20"
    )}>
      <button
        onClick={() => isLong && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left rounded-lg transition-colors",
          isLong && "hover:bg-muted/50 cursor-pointer",
          !isLong && "cursor-default"
        )}
      >
        {isError
          ? <XCircle className="h-3 w-3 shrink-0 text-red-500" />
          : <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
        <span className="font-mono font-medium text-foreground/70 truncate">
          {message.name || "tool"}
        </span>
        <span className="ml-auto mr-1 shrink-0 text-[10px] text-muted-foreground/40">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isLong && (
          open
            ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {(open || !isLong) && (
        <div className="border-t border-border/40 px-3 py-2">
          <pre className={cn(
            "max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed",
            isError ? "text-red-700/80 dark:text-red-300/70" : "text-muted-foreground/80"
          )}>
            {message.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/** SubAgent tool result block — indigo-tinted, collapsible, shows label + SubAgent badge.
 *
 * Handles two formats:
 * 1. Web-channel tool chains: name is the tool name (e.g. "exec"), content is tool output.
 * 2. Non-web summary results: name is the SubAgent label (e.g. "正方一辩"),
 *    content starts with "[SubAgent completed]" or "[Subagent '...' completed]".
 */
function SubAgentToolBlock({ message }: { message: ChatMessage }) {
  const isError = message.content.startsWith("Error:");

  // Detect summary-style messages (from _save_sub_tool_to_session or _announce_result)
  const isSummary = /^\[Sub[Aa]gent[\s']/.test(message.content);

  // For summary messages, extract just the result portion for display
  let displayContent = message.content;
  let resultSnippet = "";
  if (isSummary) {
    const resultMatch = message.content.match(/\nResult:\s*([\s\S]*)/);
    resultSnippet = resultMatch?.[1]?.trim() ?? "";
    displayContent = resultSnippet || message.content;
  }

  // Label: prefer message.name (set by backend), fall back to extracting from content
  let label = message.name || "";
  if (!label && isSummary) {
    const labelMatch = message.content.match(/^\[Subagent '(.+?)'/);
    label = labelMatch?.[1] ?? "SubAgent";
  }
  if (!label) label = "SubAgent";

  const isLong = displayContent.length > 300;
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden",
      isError
        ? "border-red-200/70 bg-red-50/40 dark:border-red-800/40 dark:bg-red-950/15"
        : "border-indigo-200/60 bg-indigo-50/30 dark:border-indigo-800/40 dark:bg-indigo-950/15"
    )}>
      <button
        onClick={() => isLong && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left rounded-lg transition-colors",
          isLong && "hover:bg-indigo-100/40 dark:hover:bg-indigo-900/20 cursor-pointer",
          !isLong && "cursor-default"
        )}
      >
        <Bot className="h-3 w-3 shrink-0 text-indigo-400/80" />
        <span className="font-medium text-indigo-500/80 dark:text-indigo-400/80 truncate max-w-[120px]">
          ⤹︎ {label}
        </span>
        <span className="text-muted-foreground/40">·</span>
        {isError
          ? <XCircle className="h-3 w-3 shrink-0 text-red-500" />
          : <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
        <span className="font-mono font-medium text-foreground/70 truncate">
          {isSummary
            ? (resultSnippet.length > 60 ? resultSnippet.slice(0, 60) + "…" : resultSnippet || "completed")
            : (message.name || "tool")}
        </span>
        <span className="ml-auto mr-1 shrink-0 text-[10px] text-muted-foreground/40">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isLong && (
          open
            ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {(open || !isLong) && displayContent.length > 60 && (
        <div className="border-t border-indigo-200/40 dark:border-indigo-800/30 px-3 py-2">
          <pre className={cn(
            "max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed",
            isError ? "text-red-700/80 dark:text-red-300/70" : "text-muted-foreground/80"
          )}>
            {displayContent}
          </pre>
        </div>
      )}
    </div>
  );
}

/** System message block — gray, collapsed by default (usually the system prompt) */
function SystemMessageBlock({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-dashed border-muted-foreground/20 bg-muted/20 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 rounded transition-colors"
      >
        <Info className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="font-medium text-muted-foreground/70">System</span>
        <span className="ml-auto mr-1 shrink-0 text-[10px] text-muted-foreground/40">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {open
          ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
      </button>
      {open && (
        <div className="border-t border-muted-foreground/10 px-3 py-2">
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground/60">
            {message.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Aligns tool/system blocks with assistant message content (past the avatar). */
function ToolMessageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4">
      <div className="h-8 w-8 shrink-0" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function MessageBubble({ message, onRevoke }: MessageBubbleProps) {
  const user = useAuthStore((s) => s.user);

  // Don't render anything for empty/whitespace messages
  if (!message.content?.trim() && !message.toolCalls?.length && !message.isStreaming) {
    return null;
  }

  // Hide redundant message() tool result — the reply is already shown as an assistant bubble
  if (message.role === "tool" && message.name === "message") {
    return null;
  }

  // SubAgent tool result (persisted from session, role="sub_tool")
  if (message.role === "sub_tool") {
    return <ToolMessageWrapper><SubAgentToolBlock message={message} /></ToolMessageWrapper>;
  }

  // SubAgent progress — indigo-tinted block with bot icon
  if (message.role === "tool" && message.isSubAgent) {
    return <ToolMessageWrapper><SubAgentProgressBlock message={message} /></ToolMessageWrapper>;
  }

  // Tool result — compact collapsible block (no avatar)
  if (message.role === "tool") {
    return <ToolMessageWrapper><ToolResultBlock message={message} /></ToolMessageWrapper>;
  }

  // System message — compact info strip, collapsed by default (no avatar)
  if (message.role === "system") {
    return <ToolMessageWrapper><SystemMessageBlock message={message} /></ToolMessageWrapper>;
  }

  const isUser = message.role === "user";
  const parts = splitThinking(message.content ?? "");
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const { t } = useTranslation();

  const copyContent = () => {
    const text = message.content ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={cn("group flex gap-3 px-4", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none",
        isUser
          ? "bg-orange-200 text-orange-900 shadow-sm dark:bg-orange-800/50 dark:text-orange-100"
          : "overflow-hidden p-0 shadow-sm"
      )}>
        {isUser
          ? (user?.username?.[0]?.toUpperCase() ?? "U")
          : <img src="/icon.png" alt="Nanobot" className="h-8 w-8 object-cover mix-blend-multiply dark:mix-blend-screen dark:brightness-150" />}
      </div>

      {/* Content */}
      <div className={cn(
        "flex min-w-0 max-w-[92%] flex-col gap-1",
        isUser ? "items-end" : "items-start"
      )}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-orange-200 px-4 py-2.5 text-sm leading-relaxed text-orange-900 shadow-sm dark:bg-orange-800/50 dark:text-orange-100">
            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</span>
          </div>
        ) : (
          <div className="w-full min-w-0 space-y-2 [overflow-wrap:anywhere]">
            {parts.map((part, i) =>
              part.type === "thinking" ? (
                <ThinkingBlock key={i} content={part.content} />
              ) : part.content.trim() ? (
                <div key={i} className={cn(
                  "prose prose-sm max-w-none dark:prose-invert break-words",
                  "[&_p]:leading-relaxed [&_p]:my-1 [&_p]:[overflow-wrap:anywhere]",
                  "[&_pre]:rounded-xl [&_pre]:bg-zinc-100 dark:[&_pre]:bg-zinc-900 [&_pre]:text-zinc-900 dark:[&_pre]:text-zinc-100 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:shadow-lg [&_pre]:overflow-x-auto",
                  "[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-xs [&_code:not(pre_code)]:font-mono",
                  "[&_blockquote]:border-l-primary [&_blockquote]:text-muted-foreground",
                  "[&_table]:text-xs [&_th]:bg-muted",
                  "[&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline",
                )}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {part.content}
                  </ReactMarkdown>
                </div>
              ) : null
            )}
            {message.toolCalls?.map((tool) => (
              <ToolCallCard key={tool.id} tool={tool} />
            ))}
            {message.isStreaming && (
              <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-foreground/60 align-middle ml-0.5" />
            )}
          </div>
        )}
        <div className="flex items-center gap-1 px-1">
          <span className="text-[11px] text-muted-foreground/60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!message.isStreaming && (
            <button
              onClick={copyContent}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-muted-foreground p-0.5 rounded"
              aria-label="Copy message"
            >
              {copied
                ? <Check className="h-3 w-3 text-emerald-500" />
                : <Copy className="h-3 w-3" />}
            </button>
          )}
          {!message.isStreaming && onRevoke && (
            confirmingRevoke ? (
              <span className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground/70">{t("chat.revokeConfirmTitle", "撤回?")}</span>
                <button
                  onClick={() => { setConfirmingRevoke(false); onRevoke(message.id); }}
                  className="text-red-500 hover:text-red-600 font-medium px-0.5 rounded"
                >
                  {t("common.confirm")}
                </button>
                <button
                  onClick={() => setConfirmingRevoke(false)}
                  className="text-muted-foreground/50 hover:text-muted-foreground p-0.5 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingRevoke(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-500 p-0.5 rounded"
                aria-label="Revoke message"
              >
                <Undo2 className="h-3 w-3" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
