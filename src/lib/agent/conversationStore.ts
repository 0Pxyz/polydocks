import { create } from "zustand";
import { streamAgentLoop } from "./client";
import { type UIEvent, type ApprovalRequest } from "./events";
import { speakReply, cancelSpeech } from "./speech";
import type { OrbState } from "@/features/agent/Orb";

export type LayoutState = "closed" | "sheet" | "full" | "side";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  timestamp: number;
  error?: {
    code?: string;
    message: string;
  };
}

interface ConversationStoreState {
  layoutState: LayoutState;
  sideWidth: number;
  messages: ConversationMessage[];
  draft: string;
  isStreaming: boolean;
  statusText: string;
  activeApproval: ApprovalRequest | null;
  soundEnabled: boolean;
  audioLevel: number;
  orbState: OrbState;

  // Actions
  setLayoutState: (layoutState: LayoutState) => void;
  setSideWidth: (width: number) => void;
  setDraft: (draft: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setAudioLevel: (level: number) => void;
  setOrbState: (state: OrbState) => void;
  setStatusText: (text: string) => void;
  toggleAgent: (currentActiveToolId?: string) => void;
  sendMessage: (
    prompt?: string,
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
  retryLast: (
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
  abortStream: () => void;
  handleApproval: (
    approved: boolean,
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
}

const SIDE_WIDTH_KEY = "polymax-agent-side-width";
const SOUND_KEY = "polymax-agent-sound";

function getInitialSideWidth(): number {
  if (typeof window === "undefined") return 400;
  const val = Number(localStorage.getItem(SIDE_WIDTH_KEY));
  if (!isNaN(val) && val >= 340 && val <= 560) return val;
  return 400;
}

function getInitialSound(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "false";
}

function getInitialLayoutState(): LayoutState {
  if (typeof window === "undefined") return "closed";
  const params = new URLSearchParams(window.location.search);
  if (params.get("agent") === "expanded" || params.get("agent") === "full") return "full";
  if (params.get("agent") === "side") return "side";
  if (params.get("agent") === "open" || params.get("agent") === "sheet") return "sheet";
  return "closed";
}

let activeAbortController: AbortController | null = null;

export const useConversationStore = create<ConversationStoreState>((set, get) => ({
  layoutState: getInitialLayoutState(),
  sideWidth: getInitialSideWidth(),
  messages: [],
  draft: "",
  isStreaming: false,
  statusText: "",
  activeApproval: null,
  soundEnabled: getInitialSound(),
  audioLevel: 0,
  orbState: "idle",

  setLayoutState: (layoutState) => set({ layoutState }),

  setSideWidth: (width) => {
    const clamped = Math.min(Math.max(width, 340), 560);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SIDE_WIDTH_KEY, String(clamped));
      } catch {
        // Ignore
      }
    }
    set({ sideWidth: clamped });
  },

  setDraft: (draft) => set({ draft }),

  setSoundEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SOUND_KEY, String(enabled));
      } catch {
        // Ignore
      }
    }
    set({ soundEnabled: enabled });
  },

  setAudioLevel: (audioLevel) => set({ audioLevel }),

  setOrbState: (orbState) => set({ orbState }),

  setStatusText: (statusText) => set({ statusText }),

  toggleAgent: (currentActiveToolId?: string) => {
    const { layoutState } = get();
    if (layoutState !== "closed") {
      set({ layoutState: "closed" });
    } else {
      const isWide = typeof window !== "undefined" && window.innerWidth >= 900;
      if (currentActiveToolId && currentActiveToolId !== "agent" && isWide) {
        set({ layoutState: "side" });
      } else {
        set({ layoutState: "sheet" });
      }
    }
  },

  abortStream: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    cancelSpeech();
    set({
      isStreaming: false,
      orbState: "idle",
      statusText: "Canceled request.",
    });
  },

  sendMessage: async (promptToSend, cityId, callbacks) => {
    const prompt = (promptToSend ?? get().draft).trim();
    if (!prompt || get().isStreaming) return;

    cancelSpeech();
    set({ draft: "", isStreaming: true, orbState: "thinking", statusText: "", activeApproval: null });

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
    }));

    const abortCtrl = new AbortController();
    activeAbortController = abortCtrl;

    const historyForBackend = get()
      .messages.filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    await streamAgentLoop({
      prompt,
      cityId,
      history: historyForBackend,
      signal: abortCtrl.signal,
      onEvent: (event: UIEvent) => {
        const { soundEnabled } = get();

        switch (event.type) {
          case "agent.started":
            set({ orbState: "thinking" });
            break;

          case "tool.started":
            set({
              orbState: "thinking",
              statusText: event.statusLabel,
            });
            set((state) => ({
              messages: [
                ...state.messages,
                {
                  id: crypto.randomUUID(),
                  role: "tool",
                  toolName: event.name,
                  content: event.statusLabel,
                  timestamp: Date.now(),
                },
              ],
            }));
            break;

          case "tool.completed":
            break;

          case "experience.created":
            callbacks?.onExperienceCreated?.(event.experience);
            set({ statusText: `Mounted "${event.experience.title}" in the dock.` });
            break;

          case "dock.open_experience":
            set({ statusText: `Opening "${event.experienceId}"…` });
            callbacks?.onOpenExperience?.(event.experienceId);

            // Per specification: from sheet or full, the chat goes to side
            // and the experience opens on the right (on >= 900px wide screens)
            if (typeof window !== "undefined" && window.innerWidth >= 900) {
              set({ layoutState: "side" });
            } else {
              set({ layoutState: "closed" });
            }
            break;

          case "approval.required":
            set({
              orbState: "idle",
              activeApproval: event.approval,
              statusText: event.approval.message,
            });
            break;

          case "agent.finished": {
            const replyText = event.text || "Done.";
            set((state) => ({
              isStreaming: false,
              orbState: "speaking",
              statusText: "",
              messages: [
                ...state.messages,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: replyText,
                  timestamp: Date.now(),
                },
              ],
            }));

            if (soundEnabled) {
              speakReply(
                replyText,
                () => set({ orbState: "speaking" }),
                () => set({ orbState: "idle" })
              );
            } else {
              set({ orbState: "idle" });
            }
            break;
          }

          case "agent.error": {
            const isUnauthorized = event.code === "model_unauthorized";
            const errorObj = {
              code: event.code,
              message: isUnauthorized
                ? "Model access isn't set up. Check your API key."
                : "Something went wrong.",
            };

            set((state) => {
              const updatedMessages = [...state.messages];
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              if (lastMsg && lastMsg.role === "user") {
                lastMsg.error = errorObj;
              }
              return {
                isStreaming: false,
                orbState: "error",
                statusText: errorObj.message,
                messages: updatedMessages,
              };
            });
            break;
          }
        }
      },
    });

    set({ isStreaming: false });
    activeAbortController = null;
  },

  retryLast: async (cityId, callbacks) => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    // Find the last user message
    const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;

    const lastUserMsg = messages[lastUserIndex];
    // Clear error from last user message and discard subsequent failed/tool attempts
    const prunedMessages = messages.slice(0, lastUserIndex);

    set({ messages: prunedMessages });
    await get().sendMessage(lastUserMsg.content, cityId, callbacks);
  },

  handleApproval: async (approved, cityId, callbacks) => {
    const { activeApproval } = get();
    if (!activeApproval) return;
    set({ activeApproval: null });

    if (approved) {
      await get().sendMessage(
        `Confirmed: proceed with ${activeApproval.toolName} for ${activeApproval.experienceId}`,
        cityId,
        callbacks
      );
    } else {
      set({ statusText: `Canceled action for ${activeApproval.experienceId}.` });
    }
  },
}));
