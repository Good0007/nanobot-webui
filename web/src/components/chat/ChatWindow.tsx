import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "../../stores/chatStore";
import { ChatWebSocket, type WsMessage } from "../../lib/ws";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

export function ChatWindow() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const {
    currentSessionKey,
    messages,
    isWaiting,
    progressText,
    showToolMessages,
    addMessage,
    setWaiting,
    setProgress,
    setCurrentSession,
    toggleToolMessages,
  } = useChatStore();

  const visibleMessages = showToolMessages
    ? messages
    : messages.filter((m) => m.role !== "tool");

  const wsRef = useRef<ChatWebSocket | null>(null);
  const assistantMsgIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleWsMessageRef = useRef<(msg: WsMessage) => void>(() => {});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = new ChatWebSocket(
      (msg) => handleWsMessageRef.current(msg),
      (connected) => setIsConnected(connected),
    );
    wsRef.current = ws;
    ws.connect(useChatStore.getState().currentSessionKey ?? undefined);
    return () => {
      ws.disconnect();
    };
  }, []);

  // Keep the WebSocket's stored session key in sync so that reconnects
  // always use the current session (e.g. after clicking "new chat").
  useEffect(() => {
    if (currentSessionKey) {
      wsRef.current?.setSession(currentSessionKey);
    }
  }, [currentSessionKey]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, progressText]);

  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === "session_info") {
        if (msg.session_key && msg.session_key !== useChatStore.getState().currentSessionKey) {
          setCurrentSession(msg.session_key);
        }
      } else if (msg.type === "progress") {
        setProgress(msg.content ?? "");
      } else if (msg.type === "done") {
        setProgress("");
        setWaiting(false);
        if (assistantMsgIdRef.current) {
          useChatStore.getState().setStreaming(assistantMsgIdRef.current, false);
          assistantMsgIdRef.current = null;
        }
        if (msg.content?.trim()) {
          addMessage({
            id: nanoid(),
            role: "assistant",
            content: msg.content,
            timestamp: new Date().toISOString(),
          });
        }
        // Refresh sessions list and current session's messages (so tool call/result
        // messages that were saved server-side appear without requiring a page reload).
        qc.invalidateQueries({ queryKey: ["sessions"] });
        const sessKey = useChatStore.getState().currentSessionKey;
        if (sessKey) {
          qc.invalidateQueries({ queryKey: ["sessions", sessKey, "messages"] });
        }
      } else if (msg.type === "error") {
        setProgress("");
        setWaiting(false);
        addMessage({
          id: nanoid(),
          role: "assistant",
          content: `⚠️ ${msg.content ?? t("common.error")}`,
          timestamp: new Date().toISOString(),
        });
      }
    },
    [addMessage, qc, setCurrentSession, setProgress, setWaiting, t]
  );

  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
  }, [handleWsMessage]);

  const handleSend = useCallback(
    (content: string) => {
      if (!wsRef.current?.isConnected) {
        wsRef.current?.connect();
      }
      addMessage({
        id: nanoid(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      });
      setWaiting(true);
      setProgress(t("chat.thinking"));
      wsRef.current?.send(content, currentSessionKey ?? undefined);
    },
    [addMessage, currentSessionKey, setProgress, setWaiting, t]
  );

  const handleStop = useCallback(() => {
    wsRef.current?.cancel();
    setWaiting(false);
    setProgress("");
  }, [setProgress, setWaiting]);

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15 shadow-inner">
              <span className="text-3xl text-primary select-none leading-none">✦</span>
            </div>
            <div className="text-center space-y-1.5">
              <p className="font-semibold text-foreground/90">Nanobot</p>
              <p className="text-sm text-muted-foreground">{t("chat.noMessages")}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        {isWaiting && progressText && (
          <div className="mt-4 flex items-start gap-3 px-4">
            <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full shadow-sm">
              <img src="/icon.png" alt="Nanobot" className="h-8 w-8 object-cover mix-blend-multiply dark:mix-blend-screen dark:brightness-150" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="truncate max-w-xs">{progressText}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <ChatInput
        onSend={handleSend}
        disabled={isWaiting}
        onStop={handleStop}
        isWaiting={isWaiting}
        isConnected={isConnected}
        showToolMessages={showToolMessages}
        onToggleToolMessages={toggleToolMessages}
      />
    </div>
  );
}
