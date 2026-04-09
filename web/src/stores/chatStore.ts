import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system" | "sub_tool";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
  name?: string; // tool result: the tool's name
  isSubAgent?: boolean; // message originated from a background SubAgent
  serverIndex?: number; // original index in the server session.messages array (used for revoke)
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input?: string;
  output?: string;
}

/** Per-session transient state (waiting indicator, progress text). */
interface SessionState {
  isWaiting: boolean;
  progressText: string;
}

interface ChatState {
  currentSessionKey: string | null;
  messages: ChatMessage[];
  showToolMessages: boolean;
  mobileShowChat: boolean;

  /** Per-session waiting / progress state — keyed by session key. */
  sessionStates: Record<string, SessionState>;

  // Convenience getters for the *current* session
  isWaiting: boolean;
  progressText: string;

  setMobileShowChat: (v: boolean) => void;
  setCurrentSession: (key: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  appendAssistantText: (id: string, text: string) => void;
  setStreaming: (id: string, isStreaming: boolean) => void;
  /** Set progress for a specific session (defaults to current). */
  setProgress: (text: string, sessionKey?: string) => void;
  /** Set waiting for a specific session (defaults to current). */
  setWaiting: (v: boolean, sessionKey?: string) => void;
  clearMessages: () => void;
  setMessages: (msgs: ChatMessage[]) => void;
  /** Remove messages by serverIndex (and all subsequent messages belonging to the same reply pair). */
  revokeMessage: (serverIndex: number) => void;
  toggleToolMessages: () => void;
  /** Get waiting state for a specific session. */
  getSessionState: (key: string) => SessionState;
}

const DEFAULT_SESSION_STATE: SessionState = { isWaiting: false, progressText: "" };

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      currentSessionKey: null,
      messages: [],
      showToolMessages: false,
      mobileShowChat: false,
      sessionStates: {},

      // Derived from sessionStates[currentSessionKey]
      get isWaiting() {
        const s = get();
        return (s.sessionStates[s.currentSessionKey ?? ""] ?? DEFAULT_SESSION_STATE).isWaiting;
      },
      get progressText() {
        const s = get();
        return (s.sessionStates[s.currentSessionKey ?? ""] ?? DEFAULT_SESSION_STATE).progressText;
      },

      setMobileShowChat: (v) => set({ mobileShowChat: v }),

      setCurrentSession: (key) =>
        set((state) => ({
          currentSessionKey: key,
          messages: state.currentSessionKey === key ? state.messages : [],
        })),

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      appendAssistantText: (id, text) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + text } : m
          ),
        })),

      setStreaming: (id, isStreaming) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, isStreaming } : m
          ),
        })),

      setProgress: (progressText, sessionKey?) =>
        set((state) => {
          const key = sessionKey ?? state.currentSessionKey ?? "";
          const prev = state.sessionStates[key] ?? DEFAULT_SESSION_STATE;
          return {
            sessionStates: { ...state.sessionStates, [key]: { ...prev, progressText } },
          };
        }),

      setWaiting: (isWaiting, sessionKey?) =>
        set((state) => {
          const key = sessionKey ?? state.currentSessionKey ?? "";
          const prev = state.sessionStates[key] ?? DEFAULT_SESSION_STATE;
          return {
            sessionStates: {
              ...state.sessionStates,
              [key]: { ...prev, isWaiting, ...(isWaiting ? {} : { progressText: "" }) },
            },
          };
        }),

      clearMessages: () => set({ messages: [] }),

      setMessages: (messages) => set({ messages }),

      revokeMessage: (serverIndex) =>
        set((state) => {
          // Find the position of the target message by serverIndex
          const pos = state.messages.findIndex((m) => m.serverIndex === serverIndex);
          if (pos === -1) return {};
          // Remove the target message and all subsequent messages
          return { messages: state.messages.slice(0, pos) };
        }),

      toggleToolMessages: () =>
        set((state) => ({ showToolMessages: !state.showToolMessages })),

      getSessionState: (key) => {
        return get().sessionStates[key] ?? DEFAULT_SESSION_STATE;
      },
    }),
    {
      name: "nanobot-chat",
      partialize: (state) => ({
        currentSessionKey: state.currentSessionKey,
        messages: state.messages,
        showToolMessages: state.showToolMessages,
      }),
    }
  )
);
