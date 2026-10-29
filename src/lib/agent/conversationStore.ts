import { create } from "zustand";
import { streamAgentLoop } from "./client";
import { type UIEvent, type ApprovalRequest } from "./events";
import { speakReply, cancelSpeech } from "./speech";
import { DEFAULT_MODEL_ID, getMetaModel } from "./models";
import { type ChatAttachment, processFileToAttachment, MAX_ATTACHMENTS_COUNT, MAX_ATTACHMENT_SIZE } from "./attachments";
import {
  clearAgentThread,
  fetchAgentThread,
  fetchOlderThreadMessages,
  getAgentUserId,
  type ThreadMessageRecord,
} from "./thread";
import { platformStorage } from "@/lib/platform/storage";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import type { OrbState } from "@/features/agent/Orb";

export type LayoutState = "closed" | "sheet" | "full" | "side";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  origin?: "dock-add" | "chat";
  toolName?: string;
  timestamp: number;
  /** Server sequence inside the single persistent thread. */
  seq?: number;
  attachments?: ChatAttachment[];
  error?: {
    code?: string;
    message: string;
  };
}

interface ConversationStoreState {
  layoutState: LayoutState;
  sideWidth: number;
  messages: ConversationMessage[];
  stagedAttachments: ChatAttachment[];
  draft: string;
  isStreaming: boolean;
  isBuildingTool: boolean;
  buildingToolName: string;
  statusText: string;
  activeApproval: ApprovalRequest | null;
  soundEnabled: boolean;
  audioLevel: number;
  orbState: OrbState;
  selectedModel: string;
  isHydratingThread: boolean;
  isLoadingOlder: boolean;
  hasOlderMessages: boolean;
  oldestMessageSeq: number | null;

  // Actions
  setLayoutState: (layoutState: LayoutState) => void;
  setSideWidth: (width: number) => void;
  setDraft: (draft: string) => void;
  hydrateThread: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  clearConversation: () => Promise<void>;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setAudioLevel: (level: number) => void;
  setOrbState: (state: OrbState) => void;
  setStatusText: (text: string) => void;
  setSelectedModel: (modelId: string) => void;
  toggleAgent: (currentActiveToolId?: string) => void;
  sendMessage: (
    prompt?: string,
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
    },
    options?: {
      origin?: "dock-add" | "chat";
      retry?: boolean;
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
const MODEL_KEY = "polymax-agent-model";

function getInitialModel(): string {
  const stored = platformStorage.getItem<string>(MODEL_KEY);
  if (stored) {
    const valid = getMetaModel(stored);
    if (valid) return valid.id;
  }
  return DEFAULT_MODEL_ID;
}

function getInitialSideWidth(): number {
  const val = Number(platformStorage.getItem<number | string>(SIDE_WIDTH_KEY));
  if (!isNaN(val) && val >= 340 && val <= 560) return val;
  return 400;
}

function getInitialSound(): boolean {
  const stored = platformStorage.getItem<boolean>(SOUND_KEY);
  return stored !== false;
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
let hydrationPromise: Promise<void> | null = null;

function toConversationMessage(message: ThreadMessageRecord): ConversationMessage {
  const parsed = Date.parse(message.createdAt);
  return {
    id: message.id,
    role: message.role === "system" ? "assistant" : message.role,
    content: message.content,
    timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
    seq: message.seq,
    attachments: message.attachments,
  };
}

function oldestSeqOf(messages: ConversationMessage[]): number | null {
  let oldest: number | null = null;
  for (const message of messages) {
    if (typeof message.seq !== "number") continue;
    if (oldest === null || message.seq < oldest) oldest = message.seq;
  }
  return oldest;
}

export const useConversationStore = create<ConversationStoreState>((set, get) => ({
  layoutState: getInitialLayoutState(),
  sideWidth: getInitialSideWidth(),
  messages: [],
  stagedAttachments: [],
  draft: "",
  isStreaming: false,
  isBuildingTool: false,
  buildingToolName: "",
  statusText: "",
  activeApproval: null,
  soundEnabled: getInitialSound(),
  audioLevel: 0,
  orbState: "idle",
  selectedModel: getInitialModel(),
  isHydratingThread: false,
  isLoadingOlder: false,
  hasOlderMessages: false,
  oldestMessageSeq: null,

  setLayoutState: (layoutState) => set({ layoutState }),

  hydrateThread: async () => {
    if (get().messages.length > 0) return;
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
      set({ isHydratingThread: true });
      try {
        const snapshot = await fetchAgentThread();
        if (!snapshot) return;

        set((state) => {
          const known = new Set(state.messages.map((message) => message.id));
          const fresh = snapshot.messages
            .map(toConversationMessage)
            .filter((message) => !known.has(message.id));
          const merged = fresh.length > 0 ? [...fresh, ...state.messages] : state.messages;

          return {
            messages: merged,
            hasOlderMessages: snapshot.hasMore,
            oldestMessageSeq: oldestSeqOf(merged),
          };
        });
      } finally {
        set({ isHydratingThread: false });
      }
    })().finally(() => {
      hydrationPromise = null;
    });

    return hydrationPromise;
  },

  loadOlderMessages: async () => {
    const { hasOlderMessages, oldestMessageSeq, isLoadingOlder } = get();
    if (!hasOlderMessages || oldestMessageSeq === null || isLoadingOlder) return;

    set({ isLoadingOlder: true });
    try {
      const page = await fetchOlderThreadMessages(oldestMessageSeq);
      if (!page) return;

      set((state) => {
        const known = new Set(state.messages.map((message) => message.id));
        const older = page.messages
          .map(toConversationMessage)
          .filter((message) => !known.has(message.id));
        const merged = older.length > 0 ? [...older, ...state.messages] : state.messages;

        return {
          messages: merged,
          hasOlderMessages: page.hasMore,
          oldestMessageSeq: oldestSeqOf(merged),
        };
      });
    } finally {
      set({ isLoadingOlder: false });
    }
  },

  clearConversation: async () => {
    const cleared = await clearAgentThread();
    if (!cleared) {
      set({ statusText: "Couldn't clear the conversation. Try again." });
      return;
    }

    set({
      messages: [],
      hasOlderMessages: false,
      oldestMessageSeq: null,
      activeApproval: null,
      statusText: "",
    });
  },

  setSelectedModel: (selectedModel) => {
    platformStorage.setItem(MODEL_KEY, selectedModel);
    set({ selectedModel });
  },

  addAttachments: async (files: File[]) => {
    const current = get().stagedAttachments;
    const remainingSlots = MAX_ATTACHMENTS_COUNT - current.length;
    if (remainingSlots <= 0) return;

    const filesToProcess = files.slice(0, remainingSlots);
    const validFiles = filesToProcess.filter((f) => f.size <= MAX_ATTACHMENT_SIZE);

    const processed = await Promise.all(
      validFiles.map((file) => processFileToAttachment(file))
    );

    set({ stagedAttachments: [...current, ...processed] });
  },

  removeAttachment: (id: string) => {
    set({
      stagedAttachments: get().stagedAttachments.filter((a) => a.id !== id),
    });
  },

  clearAttachments: () => {
    set({ stagedAttachments: [] });
  },

  setSideWidth: (width) => {
    const clamped = Math.min(Math.max(width, 340), 560);
    platformStorage.setItem(SIDE_WIDTH_KEY, clamped);
    set({ sideWidth: clamped });
  },

  setDraft: (draft) => set({ draft }),

  setSoundEnabled: (enabled) => {
    platformStorage.setItem(SOUND_KEY, enabled);
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
      isBuildingTool: false,
      orbState: "idle",
      statusText: "Canceled request.",
    });
  },

  sendMessage: async (promptToSend, cityId, callbacks, options) => {
    const rawPrompt = (promptToSend ?? get().draft).trim();
    // Drop stale image previews without stored payloads: they render as
    // placeholders in the transcript and must never be re-sent to the model.
    const attachmentsToSend = [...get().stagedAttachments].filter(
      (attachment) => !attachment.isImage || Boolean(attachment.dataUrl)
    );
    if ((!rawPrompt && attachmentsToSend.length === 0) || get().isStreaming) return;

    const prompt = rawPrompt || (attachmentsToSend.length > 0 ? "Inspect the attached files." : "");
    const origin = options?.origin || "chat";
    const isDockAdd = origin === "dock-add";

    cancelSpeech();
    set({
      draft: isDockAdd ? get().draft : "",
      stagedAttachments: [],
      isStreaming: true,
      isBuildingTool: isDockAdd,
      buildingToolName: isDockAdd ? prompt : "",
      orbState: "thinking",
      statusText: isDockAdd ? "Starting tool synthesis…" : "",
      activeApproval: null,
    });

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      origin,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
    }));

    const abortCtrl = new AbortController();
    activeAbortController = abortCtrl;

    await streamAgentLoop({
      prompt,
      cityId,
      userId: getAgentUserId(),
      modelId: get().selectedModel,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      origin,
      retry: options?.retry === true,
      signal: abortCtrl.signal,
      onEvent: async (event: UIEvent) => {
        const { soundEnabled } = get();

        switch (event.type) {
          case "agent.started":
            set({ orbState: "thinking" });
            break;

          case "tool.started":
            set({ orbState: "thinking" });
            if (event.statusLabel) {
              set({ statusText: event.statusLabel });
            }
            break;

          case "tool.completed":
            break;

          case "experience.created":
            callbacks?.onExperienceCreated?.(event.experience);
            set({
              isBuildingTool: false,
              statusText: `Mounted "${event.experience.title}" in the dock.`,
            });
            break;

          case "plugin.created":
          case "plugin.updated": {
            const isNew = event.type === "plugin.created";
            // Refresh the workspace registry so the dock picks up the tool,
            // then mount + open it through the same path as tab experiences.
            try {
              const targetWorkspace =
                event.workspaceId ||
                useWorkspaceStore.getState().activeWorkspaceId ||
                "default";
              await useWorkspaceStore.getState().fetchWorkspacePlugins(targetWorkspace);
            } catch {
              // Non-fatal: dock mount below still shows the tool
            }
            callbacks?.onExperienceCreated?.({
              id: event.plugin.id,
              title: event.plugin.title,
              icon: event.plugin.icon,
            });
            set({
              isBuildingTool: false,
              statusText: isNew
                ? `Mounted "${event.plugin.title}" in the dock.`
                : `Updated "${event.plugin.title}".`,
            });
            callbacks?.onOpenExperience?.(event.plugin.id);
            if (!isDockAdd) {
              if (typeof window !== "undefined" && window.innerWidth >= 900) {
                set({ layoutState: "side" });
              } else {
                set({ layoutState: "closed" });
              }
            }
            break;
          }

          case "plugin.published":
            set({
              isBuildingTool: false,
              statusText: `Published "${event.plugin.title}" to the store.`,
            });
            break;

          case "plugin.operated":
            set({
              statusText: event.action
                ? `Ran "${event.action}".`
                : "Done.",
            });
            break;

          case "dock.open_experience":
            set({ statusText: `Opening "${event.experienceId}"…` });
            callbacks?.onOpenExperience?.(event.experienceId);

            // Per specification: from sheet or full, the chat goes to side
            // and the experience opens on the right (on >= 900px wide screens).
            // But if origin is dock-add, chat stays closed!
            if (!isDockAdd) {
              if (typeof window !== "undefined" && window.innerWidth >= 900) {
                set({ layoutState: "side" });
              } else {
                set({ layoutState: "closed" });
              }
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
              isBuildingTool: false,
              orbState: isDockAdd ? "idle" : "speaking",
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

            if (!isDockAdd && soundEnabled) {
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
                : (isDockAdd ? "Couldn't build that. Try again." : "Something went wrong."),
            };

            set((state) => {
              const updatedMessages = [...state.messages];
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              if (lastMsg && lastMsg.role === "user") {
                lastMsg.error = errorObj;
              }
              return {
                isStreaming: false,
                isBuildingTool: false,
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

    set({ isStreaming: false, isBuildingTool: false });
    activeAbortController = null;
  },

  retryLast: async (cityId, callbacks) => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;

    // Find the last user message
    const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;

    const lastUserMsg = messages[lastUserIndex];
    const lastOrigin = lastUserMsg.origin;
    // Only re-send payloads that still exist. Transcript placeholders for
    // oversized images have no dataUrl and would fail model validation.
    const lastAttachments = (lastUserMsg.attachments || []).filter(
      (attachment) => !attachment.isImage || Boolean(attachment.dataUrl)
    );
    // Clear error from last user message and discard subsequent failed/tool attempts
    const prunedMessages = messages.slice(0, lastUserIndex);

    set({
      messages: prunedMessages,
      stagedAttachments: lastAttachments ? [...lastAttachments] : [],
    });
    await get().sendMessage(lastUserMsg.content, cityId, callbacks, {
      origin: lastOrigin,
      retry: true,
    });
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
