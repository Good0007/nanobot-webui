import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatWindow } from "../components/chat/ChatWindow";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import { useSessions, useSessionMessages } from "../hooks/useSessions";
import { useAuthStore } from "../stores/authStore";
import { useDeleteSession } from "../hooks/useSessions";
import { nanoid } from "nanoid";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatDate } from "../lib/utils";

import { CHANNEL_ICONS } from "../lib/channelIcons";

/** Extract the channel prefix from a session key, e.g. "feishu", "telegram", "web" */
function channelOf(key: string): string {
  return key.split(":")[0] ?? "web";
}

export default function Chat() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { currentSessionKey, setCurrentSession, setMessages } = useChatStore();
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
        !(m.role === "tool" && m.name === "message")
      )
      .map((m) => ({
        id: nanoid(),
        role: m.role as "user" | "assistant" | "tool" | "system",
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
      return [{ key: currentSessionKey, updated_at: new Date().toISOString() }, ...mySessions];
    }
    return mySessions;
  }, [currentSessionKey, myPrefix, mySessions]);

  const newChat = () => {
    const hexId = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const key = `web:${user?.id}:${hexId}`;
    loadedKeyRef.current = key; // mark as loaded with 0 messages so effect skips empty session
    loadedCountRef.current = 0;
    setCurrentSession(key);
  };

  const switchSession = (key: string) => {
    setCurrentSession(key); // clears messages in store
  };

  return (
    <div className="flex h-full gap-4 p-5">
      {/* Session sidebar */}
      <aside className="flex w-52 shrink-0 flex-col rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">{t("chat.sessions")}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={newChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-1" style={{ width: '100%', maxWidth: '100%' }}>
            {displaySessions.map((s) => {
              const channel = channelOf(s.key);
              const isWeb = channel === "web";
              const parts = s.key.split(":");
              const rawLabel = isWeb
                ? (parts[2] ?? s.key)
                : (parts[parts.length - 1] ?? s.key);
              // Hard-truncate to avoid overflow in narrow sidebar
              const label = rawLabel.length > 14 ? rawLabel.slice(0, 14) + "…" : rawLabel;
              const active = s.key === currentSessionKey;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors overflow-hidden",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/60"
                  )}
                  onClick={() => switchSession(s.key)}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none",
                    active ? "bg-primary-foreground/15" : "bg-muted"
                  )}>
                    {CHANNEL_ICONS[channel] ?? "💬"}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate font-medium">{label}</span>
                    <p
                      className={cn(
                        "text-[10px] mt-0.5 truncate",
                        active ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}
                    >
                      {formatDate(s.updated_at)}
                    </p>
                  </div>

                  {/* Delete */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100",
                      active && "opacity-100 text-primary-foreground hover:bg-primary-foreground/20"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession.mutate(s.key);
                      if (active) newChat();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {displaySessions.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("common.noData")}
              </p>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat area */}
      <div className="flex flex-1 flex-col rounded-lg border bg-card overflow-hidden">
        <ChatWindow />
      </div>
    </div>
  );
}
