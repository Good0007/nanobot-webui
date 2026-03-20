import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatWindow } from "../components/chat/ChatWindow";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import { useSessions, useSessionMessages } from "../hooks/useSessions";
import { useAuthStore } from "../stores/authStore";
import { useDeleteSession } from "../hooks/useSessions";
import { useIsMobile } from "../hooks/useIsMobile";
import { nanoid } from "nanoid";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, MessageSquare, Plus, Search, Trash2 } from "lucide-react";
import { cn, formatDate } from "../lib/utils";

import { CHANNEL_ICONS } from "../lib/channelIcons";

/** Extract the channel prefix from a session key, e.g. "feishu", "telegram", "web" */
function channelOf(key: string): string {
  return key.split(":")[0] ?? "web";
}

export default function Chat() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  // On mobile: track whether the user is viewing the chat window (true) or session list (false)
  const mobileShowChat = useChatStore((s) => s.mobileShowChat);
  const setMobileShowChat = useChatStore((s) => s.setMobileShowChat);
  const { currentSessionKey, setCurrentSession, setMessages } = useChatStore();
  const sessionStates = useChatStore((s) => s.sessionStates);
  const { data: sessions } = useSessions();
  const { data: sessionMsgs, isSuccess: historyLoaded } = useSessionMessages(currentSessionKey ?? "");
  const deleteSession = useDeleteSession();
  const loadedKeyRef = useRef<string | null>(null);
  const loadedCountRef = useRef<number>(0);
  // Track the exact message objects written to the store by the last setMessages call.
  // Used to identify which store messages were added locally (e.g. error bubbles)
  // vs. loaded from server, without relying on timestamps (which have timezone mismatches).
  const lastSetMsgsRef = useRef<ChatMessage[]>([]);

  // Reset local-tracking when the user switches sessions.
  useEffect(() => {
    lastSetMsgsRef.current = [];
  }, [currentSessionKey]);

  // Populate store with historical messages whenever the active session changes,
  // or when the server returns more messages after a tool call completes.
  useEffect(() => {
    if (!currentSessionKey || !historyLoaded) return;
    const serverCount = (sessionMsgs ?? []).length;
    // Run on: session switch OR server has more messages than last known count
    if (loadedKeyRef.current === currentSessionKey && serverCount <= loadedCountRef.current) return;
    loadedKeyRef.current = currentSessionKey;
    loadedCountRef.current = serverCount;
    // Filter out empty messages only (assistant stubs with null/empty content).
    // tool and system messages are included but rendered differently.
    const msgs = (sessionMsgs ?? [])
      .filter((m) =>
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        // Hide redundant "Message sent to ..." tool result — reply is shown as assistant bubble
        !(m.role === "tool" && m.name === "message") &&
        // Hide internal SubAgent bridge messages injected purely for LLM role-alternation
        !(m.role === "system" && m.content === "[Background task progress]")
      )
      .map((m) => ({
        id: nanoid(),
        role: m.role as "user" | "assistant" | "tool" | "system" | "sub_tool",
        content: m.content as string,
        timestamp: m.timestamp ?? new Date().toISOString(),
        name: m.name ?? undefined,
      }));
    // Only overwrite if we got actual history (avoids wiping persisted messages on new empty sessions)
    if (msgs.length > 0) {
      // Preserve locally-added messages not present in server data.
      // LLM errors are intentionally NOT saved to session by nanobot, so they must
      // be kept from the store rather than reloaded. We identify them by two criteria:
      //   1. Their ID was not part of the previous setMessages call (i.e. added via addMessage)
      //   2. Their text content is not already covered by the new server data (no duplicates)
      // NOTE: timestamp comparison is intentionally avoided — Python datetime.now() uses local
      // time (no Z) while JS new Date().toISOString() uses UTC (with Z), making string
      // comparison unreliable across timezones.
      const prevIds = new Set(lastSetMsgsRef.current.map((m) => m.id));
      const serverContents = new Set(msgs.map((m) => m.content));
      const localToPreserve = useChatStore.getState().messages.filter(
        (m) => !prevIds.has(m.id) && m.role !== "user" && !serverContents.has(m.content)
      );
      const merged = localToPreserve.length > 0 ? [...msgs, ...localToPreserve] : msgs;
      lastSetMsgsRef.current = merged;
      setMessages(merged);
    }
  }, [currentSessionKey, historyLoaded, sessionMsgs, setMessages]);

  const isAdmin = user?.role === "admin";
  const myPrefix = `web:${user?.id}:`;
  const [search, setSearch] = useState("");
  // Admins see all sessions; regular users see only their own web sessions
  const mySessions = useMemo(
    () =>
      isAdmin
        ? (sessions ?? []).slice().sort((a, b) =>
            (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
          )
        : (sessions?.filter((s) => s.key.startsWith(myPrefix)) ?? []),
    [isAdmin, myPrefix, sessions]
  );

  // Auto-select: if persisted key still exists keep it; otherwise fall back to first session.
  // IMPORTANT: a newly created local session key (starts with myPrefix) won't exist in
  // mySessions yet (the server only records it on first message), so don't redirect away from it.
  useEffect(() => {
    if (mySessions.length === 0) return;
    const keyExists = currentSessionKey && mySessions.some((s) => s.key === currentSessionKey);
    if (!keyExists && !currentSessionKey?.startsWith(myPrefix)) {
      setCurrentSession(mySessions[0].key);
    }
  }, [mySessions, currentSessionKey, setCurrentSession, myPrefix]);

  // If the current key is a locally-created session (not yet persisted on server),
  // prepend it to the sidebar list so the user sees it immediately after clicking "+".
  const displaySessions = useMemo(() => {
    const isLocalNew =
      currentSessionKey?.startsWith(myPrefix) &&
      !mySessions.some((s) => s.key === currentSessionKey);
    if (isLocalNew && currentSessionKey) {
      return [{ key: currentSessionKey, updated_at: new Date().toISOString(), last_message: undefined }, ...mySessions];
    }
    return mySessions;
  }, [currentSessionKey, myPrefix, mySessions]);

  // Filter sessions by search query (matches label or last message preview)
  const filteredSessions = useMemo(() => {
    if (!search.trim()) return displaySessions;
    const q = search.toLowerCase();
    return displaySessions.filter((s) => {
      const parts = s.key.split(":");
      const label = (parts[parts.length - 1] ?? s.key).toLowerCase();
      const preview = (s.last_message ?? "").toLowerCase();
      return label.includes(q) || preview.includes(q);
    });
  }, [displaySessions, search]);

  const newChat = () => {
    const hexId = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const key = `web:${user?.id}:${hexId}`;
    loadedKeyRef.current = key; // mark as loaded with 0 messages so effect skips empty session
    loadedCountRef.current = 0;
    setCurrentSession(key);
    // On mobile jump directly into the new chat window
    if (isMobile) setMobileShowChat(true);
  };

  const switchSession = (key: string) => {
    setCurrentSession(key); // clears messages in store
    if (isMobile) setMobileShowChat(true);
  };

  return (
    <div className={cn(
      "flex min-h-0",
      isMobile ? "flex-1 flex-col" : "h-full gap-4 p-5"
    )}>
      {/* Session sidebar — desktop: always visible; mobile: shown when not in chat */}
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden",
          isMobile
            ? cn("w-full flex-1 min-h-0 pt-14 bg-background", mobileShowChat && "hidden")
            : "w-52 min-w-0 rounded-xl bg-card"
        )}
        style={isMobile ? undefined : { width: "13rem", minWidth: 0, maxWidth: "13rem", boxShadow: "var(--shadow-card)" }}
      >
        {/* Header row — desktop only; mobile title is hidden, FAB used instead */}
        {!isMobile && (
          <div className="flex shrink-0 items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">{t("chat.sessions")}</span>
            <button
              onClick={newChat}
              title={t("chat.newChat")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className={cn("shrink-0", isMobile ? "px-4 pt-2 pb-3" : "px-2 py-2")}>
          <div className="relative">
            <Search className={cn(
              "absolute top-1/2 -translate-y-1/2 text-muted-foreground/50",
              isMobile ? "left-3.5 h-4 w-4" : "left-2 h-3 w-3"
            )} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("chat.searchSessions")}
              className={cn(
                "border-0 bg-muted/60 focus-visible:ring-1",
                isMobile ? "h-10 pl-10 text-base rounded-xl" : "h-7 pl-6 text-xs"
              )}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className={cn(isMobile ? "space-y-0.5 px-2 pb-24" : "space-y-0.5 px-1")}>
            {filteredSessions.map((s) => {
              const channel = channelOf(s.key);
              const isWeb = channel === "web";
              const parts = s.key.split(":");
              const rawLabel = isWeb
                ? (parts[2] ?? s.key)
                : (parts[parts.length - 1] ?? s.key);
              const maxLen = isMobile ? 28 : 14;
              const label = rawLabel.length > maxLen ? rawLabel.slice(0, maxLen) + "…" : rawLabel;
              const active = s.key === currentSessionKey;
              const sessionBusy = sessionStates[s.key]?.isWaiting ?? false;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-3 rounded-xl transition-colors",
                    isMobile ? "px-3 py-3" : "px-2 py-1.5",
                    active
                      ? "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100"
                      : "hover:bg-muted/60"
                  )}
                  onClick={() => switchSession(s.key)}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "flex shrink-0 items-center justify-center rounded-full leading-none",
                    isMobile ? "h-11 w-11 text-xl" : "h-6 w-6 text-sm",
                    active ? "bg-orange-200 dark:bg-orange-800/60" : "bg-muted"
                  )}>
                    {CHANNEL_ICONS[channel] ?? "💬"}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className={cn(
                        "truncate font-medium leading-snug",
                        isMobile ? "text-sm" : "text-xs"
                      )}>
                        {label}
                      </span>
                      <span className={cn(
                        "shrink-0 text-[10px] leading-snug",
                        active ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground/70"
                      )}>
                        {formatDate(s.updated_at)}
                      </span>
                    </div>
                    <p className={cn(
                      "mt-0.5 truncate leading-snug",
                      isMobile ? "text-xs" : "text-[10px]",
                      active ? "text-orange-700 dark:text-orange-200" : "text-muted-foreground"
                    )}>
                      {sessionBusy ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="flex gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                            <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                            <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                          </span>
                          <span className="text-primary/70">Processing…</span>
                        </span>
                      ) : (s.last_message || "—")}
                    </p>
                  </div>

                  {/* Delete */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "shrink-0 transition-opacity",
                      isMobile
                        ? cn("h-8 w-8 opacity-0 active:opacity-100", active && "opacity-100 text-orange-700 hover:bg-orange-200/60 dark:text-orange-200 dark:hover:bg-orange-800/40")
                        : cn("h-5 w-5 opacity-0 group-hover:opacity-100", active && "opacity-100 text-orange-700 hover:bg-orange-200/60 dark:text-orange-200 dark:hover:bg-orange-800/40")
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (active) {
                        const idx = displaySessions.findIndex((x) => x.key === s.key);
                        const next = displaySessions[idx + 1] ?? displaySessions[idx - 1];
                        if (next) switchSession(next.key); else newChat();
                      }
                      deleteSession.mutate(s.key);
                    }}
                  >
                    <Trash2 className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
                  </Button>
                </div>
              );
            })}

            {filteredSessions.length === 0 && (
              <div className={cn(
                "flex flex-col items-center justify-center text-muted-foreground",
                isMobile ? "py-16 gap-2" : "py-6 gap-1"
              )}>
                <MessageSquare className={cn(isMobile ? "h-10 w-10 opacity-20" : "h-6 w-6 opacity-20")} />
                <p className={cn(isMobile ? "text-sm" : "text-xs")}>{t("common.noData")}</p>
              </div>
            )}
          </div>
        </div>

        {/* FAB — mobile only, fixed bottom-right above the bottom tab bar */}
        {isMobile && (
          <button
            onClick={newChat}
            title={t("chat.newChat")}
            className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 hover:bg-primary/90"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.18)" }}
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </aside>

      {/* Chat area — desktop: always visible; mobile: shown when in chat */}
      <div
        className={cn(
          "flex flex-col bg-card overflow-hidden",
          isMobile
            ? cn("w-full flex-1 min-h-0", !mobileShowChat && "hidden")
            : "flex-1 rounded-xl bg-card"
        )}
        style={isMobile ? undefined : { boxShadow: "var(--shadow-card)" }}
      >
        {/* Mobile back button header */}
        {isMobile && (
          <div className="flex h-12 shrink-0 items-center gap-2 px-3">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => setMobileShowChat(false)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="flex-1 truncate text-sm font-medium">
              {(() => {
                if (!currentSessionKey) return t("nav.chat");
                const parts = currentSessionKey.split(":");
                const isWeb = parts[0] === "web";
                const raw = isWeb ? (parts[2] ?? currentSessionKey) : (parts[parts.length - 1] ?? currentSessionKey);
                return raw.length > 30 ? raw.slice(0, 30) + "…" : raw;
              })()}
            </span>
          </div>
        )}
        <ChatWindow />
      </div>
    </div>
  );
}
