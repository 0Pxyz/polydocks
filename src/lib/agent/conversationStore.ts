import { create } from "zustand";
import { streamAgentLoop } from "./client";
import { type UIEvent, type ApprovalRequest } from "./events";
import { speakReply, cancelSpeech } from "./speech";
import { DEFAULT_MODEL_ID, DEFAULT_REASONING_EFFORT, getMetaModel, isValidReasoningEffort, type ReasoningEffort } from "./models";
import { type ChatAttachment, processFileToAttachment, MAX_ATTACHMENTS_COUNT, MAX_ATTACHMENT_SIZE } from "./attachments";
import { THEMES, useThemeStore, type ThemeId, type DockStyleId, type DockPosition } from "@/lib/theme";
import {
  clearAgentThread,
  fetchAgentThread,
  fetchOlderThreadMessages,
  getAgentUserId,
  type ThreadMessageRecord,
} from "./thread";
import { platformStorage } from "@/lib/platform/storage";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { DOCK_TOOL_DESCRIPTIONS } from "@/lib/dock/dockModel";
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
  /** Effective model that produced this reply (may differ from selection). */
  model?: string;
  error?: {
    code?: string;
    message: string;
  };
}

export interface ActivityRow {
  id: string;
  label: string;
  state: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
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
  /** Compact per-step progress rows for the active turn (cleared on finish). */
  activity: ActivityRow[];
  /** Client timestamp of the last SSE event (drives the stuck message). */
  lastEventAt: number;
  /** What the loop last reported waiting on. */
  currentPhase: string;
  activeApproval: ApprovalRequest | null;
  soundEnabled: boolean;
  audioLevel: number;
  orbState: OrbState;
  selectedModel: string;
  isHydratingThread: boolean;
  isLoadingOlder: boolean;
  hasOlderMessages: boolean;
  oldestMessageSeq: number | null;
  /** Model + intent actually executing the current turn (null when idle). */
  activeModel: string | null;
  activeIntent: string | null;

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
  selectedEffort: ReasoningEffort;
  setSelectedEffort: (effort: ReasoningEffort) => void;
  toggleAgent: (currentActiveToolId?: string) => void;
  sendMessage: (
    prompt?: string,
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
      onCloseExperience?: (expId: string) => void;
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
      onCloseExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
  abortStream: () => void;
  handleApproval: (
    approved: boolean,
    cityId?: string,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
      onCloseExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
}

const SIDE_WIDTH_KEY = "polymax-agent-side-width";
const SOUND_KEY = "polymax-agent-sound";
const MODEL_KEY = "polymax-agent-model";
const EFFORT_KEY = "polymax-agent-effort";

function getInitialEffort(): ReasoningEffort {
  const stored = platformStorage.getItem<string>(EFFORT_KEY);
  if (isValidReasoningEffort(stored)) return stored;
  return DEFAULT_REASONING_EFFORT;
}

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
  activity: [],
  lastEventAt: 0,
  currentPhase: "",
  activeApproval: null,
  soundEnabled: getInitialSound(),
  audioLevel: 0,
  orbState: "idle",
  selectedModel: getInitialModel(),
  selectedEffort: getInitialEffort(),
  isHydratingThread: false,
  isLoadingOlder: false,
  hasOlderMessages: false,
  oldestMessageSeq: null,
  activeModel: null,
  activeIntent: null,

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

  setSelectedEffort: (selectedEffort) => {
    platformStorage.setItem(EFFORT_KEY, selectedEffort);
    set({ selectedEffort });
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
      activity: [],
      currentPhase: "",
    });
  },

  sendMessage: async (promptToSend, cityId, callbacks, options) => {
    const rawPrompt = (promptToSend ?? get().draft).trim();
    // Drop stale image previews without stored payloads: they render as
    // placeholders in the transcript and must never be re-sent to the model.
    const attachmentsToSend = [...get().stagedAttachments].filter(
      (attachment) => !attachment.isImage || Boolean(attachment.dataUrl)
    );
    if (!rawPrompt && attachmentsToSend.length === 0) return;
    if (get().isStreaming) {
      // Never silently drop a request: the previous turn is still running,
      // so say so instead of leaving the user staring at stale progress.
      set({ statusText: "Still working on the previous request — wait for it or stop it first." });
      return;
    }

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

    // Tracks whether the stream delivered a terminal event. If the server
    // dies mid-turn (crash, network cut), no finish/error ever arrives and
    // the UI would otherwise stay "streaming" forever, swallowing retries.
    let sawTerminalEvent = false;

    await streamAgentLoop({
      prompt,
      cityId,
      userId: getAgentUserId(),
      modelId: get().selectedModel,
      reasoningEffort: get().selectedEffort,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      origin,
      retry: options?.retry === true,
      signal: abortCtrl.signal,
      onEvent: async (event: UIEvent) => {
        const { soundEnabled } = get();
        // Every event proves the turn is alive (drives the stuck message).
        set({ lastEventAt: Date.now() });

        switch (event.type) {
          case "agent.heartbeat":
            set({
              currentPhase:
                event.phase === "running_tool" && event.tool
                  ? `Running ${event.tool}`
                  : "Thinking",
            });
            break;

          case "agent.started":
            set({
              orbState: "thinking",
              activeModel: event.model || null,
              activeIntent: event.intent || null,
              activity: [],
              currentPhase: "Thinking",
            });
            break;

          case "tool.started":
            set({ orbState: "thinking" });
            if (event.statusLabel) {
              set({ statusText: event.statusLabel });
              set((state) => ({
                activity: [
                  ...state.activity,
                  {
                    id: event.id || `${event.name}-${Date.now()}`,
                    label: event.statusLabel as string,
                    state: "running" as const,
                    startedAt: Date.now(),
                  },
                ],
              }));
            }
            break;

          case "tool.completed":
            set((state) => ({
              activity: state.activity.map((row) =>
                row.id === event.id ? { ...row, state: "done" as const, finishedAt: Date.now() } : row
              ),
            }));
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

          case "dock.layout": {
            // Agent-driven dock change: the server already validated the id
            // against workspace data; admit it to the known set and verify
            // the state transition by reading it back. Failures surface as
            // status text instead of pretending the dock changed.
            if (!event.success) {
              set({ statusText: event.message || `Couldn't change the dock.` });
              break;
            }
            const dock = useDockStore.getState();
            const knownIds = new Set([
              ...Object.keys(DOCK_TOOL_DESCRIPTIONS),
              ...useWorkspaceStore.getState().workspacePlugins.map((wp) => wp.pluginId),
              ...dock.pinnedToolIds,
              ...dock.openIds,
              event.itemId,
            ]);
            const result = dock.applyDirective({ op: event.op, id: event.itemId }, knownIds);
            if (event.op === "close" && result.ok) {
              callbacks?.onCloseExperience?.(event.itemId);
            }
            set({
              statusText: result.ok
                ? result.message
                : `Couldn't ${event.op} "${event.itemId}": ${result.message}`,
            });
            break;
          }

          case "approval.required":
            set({
              orbState: "idle",
              activeApproval: event.approval,
              statusText: event.approval.message,
            });
            break;

          case "agent.finished": {
            const replyText = event.text || "Done.";
            sawTerminalEvent = true;
            set((state) => ({
              isStreaming: false,
              isBuildingTool: false,
              orbState: isDockAdd ? "idle" : "speaking",
              statusText: "",
              activity: [],
              currentPhase: "",
              activeModel: null,
              activeIntent: null,
              messages: [
                ...state.messages,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: replyText,
                  timestamp: Date.now(),
                  ...(event.model ? { model: event.model } : {}),
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
            sawTerminalEvent = true;
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
                activity: state.activity.map((row) =>
                  row.state === "running" ? { ...row, state: "error" as const, finishedAt: Date.now() } : row
                ),
                currentPhase: "",
                activeModel: null,
                activeIntent: null,
                messages: updatedMessages,
              };
            });
            break;
          }

          case "theme.applied": {
            const applied = event.applied || {};
            const failures: string[] = [];

            let wallpaperUrl =
              typeof applied.wallpaperUrl === "string" ? applied.wallpaperUrl : undefined;
            if (!wallpaperUrl && event.attachmentId) {
              const lastUser = [...get().messages].reverse().find((m) => m.role === "user");
              const match = lastUser?.attachments?.find((a) => a.id === event.attachmentId);
              if (match?.dataUrl) {
                wallpaperUrl = match.dataUrl;
              } else {
                failures.push("couldn't resolve the attached image — please re-attach it");
              }
            }

            try {
              const themeApi = useThemeStore.getState();
              if (applied.theme !== undefined) {
                if (typeof applied.theme === "string" && THEMES.some((t) => t.id === applied.theme)) {
                  themeApi.setTheme(applied.theme as ThemeId);
                } else {
                  failures.push(`unknown theme "${String(applied.theme)}"`);
                }
              }
              if (applied.accentColor !== undefined) {
                if (typeof applied.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(applied.accentColor)) {
                  themeApi.setCustomAccentColor(applied.accentColor);
                } else {
                  failures.push(`invalid accent color "${String(applied.accentColor)}"`);
                }
              }
              if (applied.dockStyle !== undefined) {
                const valid = ["glass", "solid", "bare", "lift"] as const;
                if (typeof applied.dockStyle === "string" && (valid as readonly string[]).includes(applied.dockStyle)) {
                  themeApi.setDockStyle(applied.dockStyle as DockStyleId);
                } else {
                  failures.push(`unknown dock style "${String(applied.dockStyle)}"`);
                }
              }
              if (applied.dockPosition !== undefined) {
                if (applied.dockPosition === "top" || applied.dockPosition === "bottom") {
                  themeApi.setDockPosition(applied.dockPosition as DockPosition);
                } else {
                  failures.push(`unknown dock position "${String(applied.dockPosition)}"`);
                }
              }
              if (applied.clearWallpaper === true) {
                themeApi.clearWallpaper();
              } else if (wallpaperUrl) {
                const fit =
                  applied.wallpaperFit === "cover" || applied.wallpaperFit === "contain" || applied.wallpaperFit === "tile"
                    ? applied.wallpaperFit
                    : undefined;
                const opacity = typeof applied.wallpaperOpacity === "number" ? applied.wallpaperOpacity : undefined;
                const blur = typeof applied.wallpaperBlur === "number" ? applied.wallpaperBlur : undefined;
                themeApi.setWallpaper(wallpaperUrl, { fit, opacity, blur });
              }
            } catch (err: any) {
              failures.push(err?.message || "theme store unavailable");
            }

            // Verify against the real store state — report what actually applied.
            const live = useThemeStore.getState();
            const mismatches: string[] = [];
            if (applied.theme !== undefined && live.theme !== applied.theme) mismatches.push("theme");
            if (applied.accentColor !== undefined && live.customAccentColor !== applied.accentColor) {
              mismatches.push("accent");
            }
            if (wallpaperUrl && live.wallpaperUrl !== wallpaperUrl) mismatches.push("wallpaper");
            const problems = [...failures, ...mismatches.map((m) => `${m} did not persist`)];

            if (problems.length === 0) {
              set({ isBuildingTool: false, statusText: "Theme updated — verified in the live theme store." });
            } else {
              // Persist the failure on the user turn (the finish event clears
              // transient status text, so a silent clear must not hide this).
              const message = `Theme partially applied: ${problems.join("; ")}.`;
              set((state) => {
                const updatedMessages = [...state.messages];
                const lastMsg = updatedMessages[updatedMessages.length - 1];
                if (lastMsg && lastMsg.role === "user") {
                  lastMsg.error = { message };
                }
                return { isBuildingTool: false, statusText: message, messages: updatedMessages };
              });
            }
            break;
          }
        }
      },
    });

    // A stream that ends with no terminal event (server crash, network cut)
    // must not leave the UI stuck in "streaming" with a stale progress line.
    if (!sawTerminalEvent) {
      const errorObj = { code: "stream_ended", message: "Stream ended unexpectedly. Check the connection and retry." };
      set((state) => {
        const updatedMessages = [...state.messages];
        const lastMsg = updatedMessages[updatedMessages.length - 1];
        if (lastMsg && lastMsg.role === "user" && !lastMsg.error) {
          lastMsg.error = errorObj;
        }
        return {
          isStreaming: false,
          isBuildingTool: false,
          orbState: "error",
          statusText: errorObj.message,
          activity: [],
          currentPhase: "",
          activeModel: null,
          activeIntent: null,
          messages: updatedMessages,
        };
      });
    }

    set({ isStreaming: false, isBuildingTool: false });
    activeAbortController = null;
  },

  retryLast: async (cityId, callbacks) => {
    const { messages, isStreaming } = get();
    if (isStreaming) {
      set({ statusText: "Still working on the previous request — wait for it or stop it first." });
      return;
    }

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
