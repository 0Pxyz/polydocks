import { create } from "zustand";
import { streamAgentLoop } from "./client";
import { type UIEvent, type ApprovalRequest, getFriendlyToolStatus, adaptBackendEvent, isBrandedActivity } from "./events";
import { feedThoughtEvent, pushThought, shouldNudge } from "./thoughtStream";
import { applyOrchestratorAction } from "./orchestratorActions";
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
import { useOnboardingStore } from "@/lib/store/useOnboardingStore";
import { onboardingIntentFromTool } from "./onboardingBridge";
import { DOCK_TOOL_DESCRIPTIONS } from "@/lib/dock/dockModel";
import { chatPlacement } from "@/lib/dock/dockItems";
import type { OrbState } from "@/features/agent/Orb";

const ORCH_SESSION_KEY = "polymax-orchestrator-session";
const JOB_EVENT_CURSOR_KEY = "polymax-job-event-cursor";

let taskEventSource: EventSource | null = null;
let taskStreamSession: string | null = null;
/** Latest send callbacks: plugin.created mounts through them (auto-open). */
let pendingPluginCallbacks:
  | {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
      onCloseExperience?: (expId: string) => void;
    }
  | undefined;
/** Terminal jobs already announced in chat (no duplicate "done" lines). */
const announcedJobs = new Set<string>();

function loadOrchestratorSession(): string | null {
  try {
    const v = platformStorage.getItem<string | null>(ORCH_SESSION_KEY, null);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

function loadJobCursor(sessionId: string): number | undefined {
  try {
    const raw = platformStorage.getItem<Record<string, number>>(JOB_EVENT_CURSOR_KEY, {});
    const n = raw?.[sessionId];
    return typeof n === "number" ? n : undefined;
  } catch {
    return undefined;
  }
}

function saveJobCursor(sessionId: string, id: number): void {
  try {
    const raw = platformStorage.getItem<Record<string, number>>(JOB_EVENT_CURSOR_KEY, {}) || {};
    raw[sessionId] = id;
    platformStorage.setItem(JOB_EVENT_CURSOR_KEY, raw);
  } catch {
    // Best-effort: resume just replays more.
  }
}

export type LayoutState = "closed" | "sheet" | "full" | "side";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  origin?: "dock-add" | "chat";
  toolName?: string;
  timestamp: number;
  /** Live-streaming placeholder for orchestrator replies (cleared on done). */
  streaming?: boolean;
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
  /** Machine tool name (used for provider branding, e.g. TinyFish). */
  tool?: string;
}

/** One step in the per-message / per-job thinking timeline. */
export interface AgentStep {
  /** Stable id for replay dedup (tool call id or event id). */
  id: string;
  kind: "search" | "read" | "build" | "save" | "think";
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
  at: number;
}

/** Background job card: updated by the resumable job SSE stream. */
export interface TaskCard {
  taskId: string;
  title: string;
  status: "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "interrupted";
  approvalId?: string;
  updatedAt: number;
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
  /** Provisional reply text assembled from streamed deltas (cleared on finish). */
  streamingText: string;
  /** In-chat reader panel (video / article / embed / external). Store-level so it survives tab navigation. */
  readerView: null | {
    sourceId?: string;
    mode: "video" | "reader" | "embed" | "external";
    title: string;
    url: string;
    workspaceId?: string;
    site?: string;
    image?: string | null;
    markdown?: string;
    embedUrl?: string;
    reason?: string;
  };
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
  /** Orchestrator session for the non-blocking message queue (persisted). */
  orchestratorSessionId: string | null;
  /** Live background-job cards keyed by task id (resumable SSE). */
  taskCards: Record<string, TaskCard>;
  /** Thinking steps per message/job id (durable, replay-safe, id-keyed). */
  messageSteps: Record<string, AgentStep[]>;
  /** Collapsed pre-tool narration per message id (the "thinking" block). */
  messageThinking: Record<string, string>;
  /** Open (or reuse) the job-event stream for a session. Returns the live instance. */
  ensureTaskStream: (sessionId: string) => EventSource | null;
  /**
   * Resume active jobs after a reload (#178): reopens the stream (replay
   * from the persisted cursor rebuilds cards/steps) and seeds queued/
   * running cards from the API so jobs are visible before replay lands.
   * Terminal states are never seeded — history already carries outcomes.
   */
  hydrateJobs: () => Promise<void>;

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
  /** One-shot request: start voice input once the panel is up (home orb). */
  pendingVoiceStart: boolean;
  requestVoiceStart: () => void;
  consumeVoiceStart: () => void;
  sendMessage: (
    prompt?: string,
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
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
      onCloseExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
  abortStream: () => void;
  openReader: (view: NonNullable<ConversationStoreState["readerView"]>) => void;
  closeReader: () => void;
  handleApproval: (
    approved: boolean,
    callbacks?: {
      onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
      onOpenExperience?: (expId: string) => void;
      onCloseExperience?: (expId: string) => void;
    }
  ) => Promise<void>;
}

/** Opened-source view: rendered inside the Sources plugin area, never as an overlay. */
export type OpenedSourceView = NonNullable<ConversationStoreState["readerView"]>;

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
/** One honest nudge per turn once heartbeats go quiet past the threshold. */
let heartbeatNudged = false;

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
  streamingText: "",
  readerView: null,
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
  pendingVoiceStart: false,
  orchestratorSessionId: loadOrchestratorSession(),
  taskCards: {},
  messageSteps: {},
  messageThinking: {},

  setLayoutState: (layoutState) => set({ layoutState }),
  requestVoiceStart: () => set({ pendingVoiceStart: true }),
  consumeVoiceStart: () => set({ pendingVoiceStart: false }),

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
      const side = typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side";
      if (currentActiveToolId && currentActiveToolId !== "agent" && side) {
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
      streamingText: "",
    });
  },

  openReader: (view) => set({ readerView: view, statusText: "" }),

  closeReader: () => set({ readerView: null }),

  ensureTaskStream: (sessionId) => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return null;
    }
    if (taskEventSource && taskStreamSession === sessionId) {
      return taskEventSource;
    }
    try {
      taskEventSource?.close();
    } catch {
      // Ignore close errors on a stale stream.
    }
    taskStreamSession = sessionId;
    const from = loadJobCursor(sessionId);
    const url =
      `/api/tasks/stream?sessionId=${encodeURIComponent(sessionId)}` +
      (from !== undefined ? `&from=${from}` : "");
    const source = new EventSource(url);
    taskEventSource = source;
    // Named SSE events never hit onmessage: one listener per type,
    // all funneled into the same ordered handler. Loop side-effects ride
    // the same durable stream under the message scope (tool.*, plugin.*,
    // theme/dock/reader effects) so answer_quick turns render steps too.
    for (const type of [
      "job.queued",
      "job.started",
      "job.progress",
      "job.completed",
      "job.failed",
      "job.cancelled",
      "job.interrupted",
      "job.awaiting_approval",
      "message.delta",
      "message.done",
      "message.error",
      "plugin.created",
      "plugin.updated",
      "plugin.published",
      "plugin.operated",
      "tool.start",
      "tool.done",
      "tab.created",
      "tab.prime",
      "tray.open",
      "browser.open",
      "sandbox.preview",
      "dock.layout",
      "theme.apply",
      "source.added",
      "agent.start",
      "agent.finish",
    ]) {
      source.addEventListener(type, (ev: Event) => {
        const msg = ev as MessageEvent;
        try {
          const data = JSON.parse(msg.data);
          const rawId = typeof msg.lastEventId === "string" && msg.lastEventId !== "" ? Number(msg.lastEventId) : undefined;
          handleJobSseEvent(sessionId, type, data, Number.isInteger(rawId) ? (rawId as number) : undefined);
        } catch {
          // Malformed frames are ignored; the cursor only moves on parseable rows.
        }
      });
    }
    source.onerror = () => {
      // EventSource reconnects on its own with Last-Event-ID; drop only a
      // permanently closed stream so the next message reopens it.
      if (source.readyState === EventSource.CLOSED) {
        if (taskEventSource === source) taskEventSource = null;
      }
    };
    return source;
  },

  hydrateJobs: async () => {
    const sessionId = get().orchestratorSessionId;
    if (!sessionId || typeof window === "undefined") return;
    // Reopen first: replay from the persisted cursor rebuilds cards and
    // thinking steps for everything the stream already carries.
    get().ensureTaskStream(sessionId);
    // Then seed still-active jobs so they render before replay lands.
    // Terminal states stay out: outcomes live in the thread history.
    try {
      const res = await fetch(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      set((state) => {
        const cards = { ...state.taskCards };
        for (const t of tasks) {
          if (t?.status !== "queued" && t?.status !== "running" && t?.status !== "awaiting_approval") continue;
          const id = String(t.id);
          if (cards[id]) continue;
          const prompt = t?.input && typeof t.input.prompt === "string" ? t.input.prompt : "";
          cards[id] = {
            taskId: id,
            title: prompt ? prompt.slice(0, 80) : `Background job ${id.slice(0, 8)}`,
            status: t.status,
            updatedAt: Date.now(),
          };
        }
        return { taskCards: cards };
      });
    } catch {
      // Offline-first: cards still rebuild from the stream replay above.
    }
  },

  sendMessage: async (promptToSend, callbacks, options) => {
    const rawPrompt = (promptToSend ?? get().draft).trim();
    // Drop stale image previews without stored payloads: they render as
    // placeholders in the transcript and must never be re-sent to the model.
    const attachmentsToSend = [...get().stagedAttachments].filter(
      (attachment) => !attachment.isImage || Boolean(attachment.dataUrl)
    );
    if (!rawPrompt && attachmentsToSend.length === 0) return;
    // Text-only turns go through the non-blocking orchestrator: the input
    // stays enabled while jobs run. Attachments/retries keep the legacy
    // streaming turn (unchanged below).
    const useOrchestrator = attachmentsToSend.length === 0 && options?.retry !== true;
    if (!useOrchestrator && get().isStreaming) {
      // Never silently drop a request: the previous turn is still running,
      // so say so instead of leaving the user staring at stale progress.
      set({ statusText: "Still working on the previous request — wait for it or stop it first." });
      return;
    }

    const prompt = rawPrompt || (attachmentsToSend.length > 0 ? "Inspect the attached files." : "");
    const origin = options?.origin || "chat";
    const isDockAdd = origin === "dock-add";

    cancelSpeech();
    // The orchestrator path never holds the global thinking state: it
    // appends the user message and returns, leaving the input enabled.
    // Only legacy streaming turns (attachments/retries) set isStreaming.
    set({
      draft: isDockAdd ? get().draft : "",
      stagedAttachments: [],
      isStreaming: useOrchestrator ? false : true,
      isBuildingTool: isDockAdd && !useOrchestrator,
      buildingToolName: isDockAdd && !useOrchestrator ? prompt : "",
      orbState: useOrchestrator ? get().orbState : "thinking",
      statusText: isDockAdd && !useOrchestrator ? "Starting tool synthesis…" : "",
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

    if (useOrchestrator) {
      await sendViaOrchestrator(prompt, origin, callbacks);
      return;
    }

    const abortCtrl = new AbortController();
    activeAbortController = abortCtrl;

    // Tracks whether the stream delivered a terminal event. If the server
    // dies mid-turn (crash, network cut), no finish/error ever arrives and
    // the UI would otherwise stay "streaming" forever, swallowing retries.
    let sawTerminalEvent = false;

    await streamAgentLoop({
      prompt,
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
            // Real-data nudge: one honest line the first time a turn goes
            // quiet past the threshold (never prompt/code/args, only the
            // phase the backend already reports).
            if (shouldNudge(event.elapsedMs, heartbeatNudged)) {
              heartbeatNudged = true;
              const label =
                event.phase === "running_tool" && event.tool
                  ? getFriendlyToolStatus(event.tool)
                  : null;
              pushThought(label ? `Still working — ${label.toLowerCase()}` : "Still working…");
            }
            break;

          case "agent.text_delta":
            if (event.delta) {
              set((state) => ({ streamingText: state.streamingText + event.delta }));
            }
            break;

          case "agent.started":
            heartbeatNudged = false;
            set({
              orbState: "thinking",
              activeModel: event.model || null,
              activeIntent: event.intent || null,
              activity: [],
              streamingText: "",
              currentPhase: "Thinking",
            });
            break;

          case "tool.started":
            set({ orbState: "thinking" });
            // Agent entry path for the walkthrough: the capability-side
            // events never reach SSE, so the client opens the dock tab
            // from the tool call itself (invoke_capability or cap.*).
            try {
              const intent = onboardingIntentFromTool(
                event.name || "",
                (event.args ?? {}) as Record<string, unknown>
              );
              if (intent) {
                const onboarding = useOnboardingStore.getState();
                if (intent.action === "start") onboarding.startDemo(intent.replay);
                else if (intent.action === "step") onboarding.setStep(intent.step);
                else if (intent.action === "replay") onboarding.startDemo(true);
                else onboarding.skipDemo();
              }
            } catch {
              // Never break the turn on a walkthrough sync failure.
            }
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
                    tool: event.name,
                  },
                ],
              }));
              // Living-agent stream: status lines drift up and fade; the
              // sheet keeps the persistent activity rows.
              feedThoughtEvent({ type: event.type, statusLabel: event.statusLabel, tool: event.name, capability: (event.args as Record<string, unknown> | undefined)?.id as string | undefined });
            }
            break;

          case "tool.completed":
            set((state) => ({
              activity: dissolveCompletedActivity(state.activity, event.id),
            }));
            // Memory badge shares the orchestrator path so legacy turns
            // render the same line (id-guarded, replay-safe).
            void applyOrchestratorAction(event, callbacks).catch(() => {});
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
              if (typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side") {
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
            // and the experience opens on the right (on wide screens, same
            // threshold as the beside panel). But if origin is dock-add,
            // chat stays closed!
            if (!isDockAdd) {
              if (typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side") {
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


          case "reader.open":
            applyReaderOpened(event);
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
            sawTerminalEvent = true;
            heartbeatNudged = false;
            set((state) => ({
              isStreaming: false,
              isBuildingTool: false,
              orbState: isDockAdd ? "idle" : "speaking",
              statusText: "",
              activity: [],
              currentPhase: "",
              streamingText: "",
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
            heartbeatNudged = false;
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
                streamingText: "",
                activeModel: null,
                activeIntent: null,
                messages: updatedMessages,
              };
            });
            break;
          }

          case "source.added": {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("polymax:source.added", { detail: event.source }));
            }
            break;
          }

          case "theme.applied": {            const applied = event.applied || {};
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
          streamingText: "",
          activeModel: null,
          activeIntent: null,
          messages: updatedMessages,
        };
      });
    }

    set({ isStreaming: false, isBuildingTool: false });
    activeAbortController = null;
  },

  retryLast: async (callbacks) => {
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
    await get().sendMessage(lastUserMsg.content, callbacks, {
      origin: lastOrigin,
      retry: true,
    });
  },

  handleApproval: async (approved, callbacks) => {
    const { activeApproval } = get();
    if (!activeApproval) return;
    set({ activeApproval: null });

    if (approved) {
      await get().sendMessage(
        `Confirmed: proceed with ${activeApproval.toolName} for ${activeApproval.experienceId}`,
        callbacks
      );
    } else {
      set({ statusText: `Canceled action for ${activeApproval.experienceId}.` });
    }
  },
}));

/**
 * Non-blocking send: POST returns 202 with ids at once, the reply streams
 * back as durable message.* events. The input never waits — not for the
 * POST, not for jobs.
 */
async function sendViaOrchestrator(
  prompt: string,
  origin: "dock-add" | "chat",
  callbacks?: {
    onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
    onOpenExperience?: (expId: string) => void;
    onCloseExperience?: (expId: string) => void;
  }
): Promise<void> {
  if (callbacks) {
    pendingPluginCallbacks = callbacks;
  }
  let posted: { messageId: string; sessionId: string } | null = null;
  try {
    // Reuse the stable session (#347): without it the server mints one
    // session per message, and the stream follows only the latest — job
    // completions from earlier messages land on a closed stream and never
    // render until reload. The server creates a fresh session when the
    // stored one is missing or expired.
    const sessionId = useConversationStore.getState().orchestratorSessionId ?? undefined;
    const res = await fetch("/api/agent/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, origin, ...(sessionId ? { sessionId } : {}) }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success && typeof json.messageId === "string") {
      posted = { messageId: json.messageId, sessionId: json.sessionId };
    }
  } catch {
    posted = null;
  }

  if (!posted) {
    useConversationStore.setState((state) => ({
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "assistant", content: "Couldn't reach the orchestrator just now.", timestamp: Date.now() },
      ],
    }));
    return;
  }

  const { messageId, sessionId } = posted;
  useConversationStore.setState((state) => ({
    orchestratorSessionId: sessionId,
    messages: [
      ...state.messages,
      { id: `m-${messageId}`, role: "assistant", content: "", streaming: true, timestamp: Date.now() },
    ],
  }));
  try {
    platformStorage.setItem(ORCH_SESSION_KEY, sessionId);
  } catch {
    // Best-effort persistence.
  }
  useConversationStore.getState().ensureTaskStream(sessionId);
}

/** Map a tool name to a timeline step kind. Internal bookkeeping tools are skipped (null). */
function stepKindForTool(toolName: string): AgentStep["kind"] | null {
  switch (toolName) {
    case "search_web":
    case "search.web":
      return "search";
    case "fetch_page":
    case "search.fetch":
      return "read";
    case "create_plugin":
    case "modify_plugin":
    case "operate_plugin":
    case "promote_to_plugin":
    case "publish_plugin":
    case "sandbox_exec":
      return "build";
    case "apply_theme":
    case "dock_search":
    case "dock_pin":
    case "dock_unpin":
    case "dock_close":
    case "dock_open":
      return "save";
    case "recall_memory":
    case "record_memory":
    case "list_files":
    case "read_file":
    case "inspect_experience":
    case "dock_list":
      return null;
    default:
      return "think";
  }
}

/** Scope key for steps/thinking: real background tasks use the raw task id,
 * everything else (message-scoped loop events) shares the `m-` message key.
 * Exported so cards and tests resolve the same bucket the stream writes to. */
/**
 * Applies a tool completion to the live activity list (#323). Branded
 * provider pills dissolve — the durable transcript row and the steps
 * timeline keep the history. Plain rows flip to done.
 */
export function dissolveCompletedActivity(
  activity: ActivityRow[],
  eventId: string
): ActivityRow[] {
  return activity
    .filter((row) => row.id !== eventId || !isBrandedActivity(row.tool, row.label))
    .map((row) =>
      row.id === eventId ? { ...row, state: "done" as const, finishedAt: Date.now() } : row
    );
}

export function scopeKeyFor(taskId: string): string {
  return taskId.startsWith("task_") ? taskId : `m-${taskId}`;
}

/** Idempotent step upsert: replay/resume never duplicates (match by stable id). */
function upsertStep(scopeKey: string, step: AgentStep): void {
  useConversationStore.setState((state) => {
    const existing = state.messageSteps[scopeKey] || [];
    const idx = existing.findIndex((s) => s.id === step.id);
    const next =
      idx >= 0 ? existing.map((s, i) => (i === idx ? { ...s, ...step } : s)) : [...existing, step];
    return { messageSteps: { ...state.messageSteps, [scopeKey]: next } };
  });
}

/** Mark every running step in a scope finished (done/error). */
function finishScopeSteps(scopeKey: string, status: "done" | "error"): void {
  useConversationStore.setState((state) => {
    const existing = state.messageSteps[scopeKey];
    if (!existing || existing.length === 0) return state;
    if (!existing.some((s) => s.status === "running")) return state;
    return {
      messageSteps: {
        ...state.messageSteps,
        [scopeKey]: existing.map((s) => (s.status === "running" ? { ...s, status } : s)),
      },
    };
  });
}

/**
 * One durable event from the resumable stream. Message events update the
 * per-message placeholder (streaming text, then final); job events update
 * cards silently and only a fresh terminal transition appends a chat
 * message. Replays and reconnects never duplicate anything: every branch
 * below is idempotent on (id, status).
 */
function handleJobSseEvent(sessionId: string, type: string, data: any, id?: number): void {
  const taskId = typeof data?.jobId === "string" ? data.jobId : null;
  if (!taskId) return;
  if (id !== undefined) saveJobCursor(sessionId, id);

  if (type.startsWith("message.")) {
    handleMessageSseEvent(taskId, type, data);
    return;
  }

  // Loop side-effects (tools, dock/theme/reader, plugin registrations) ride
  // the same durable stream: apply through the shared handler so the
  // orchestrator path behaves exactly like the legacy turn.
  try {
    const adapted = adaptBackendEvent({ type, payload: (data || {}) as Record<string, any> });
    if (adapted) {
      void applyOrchestratorAction(adapted, pendingPluginCallbacks).catch(() => {});
    }
  } catch {
    // A bad payload must never break the event stream.
  }

  // Thinking timeline for job cards: tool.start opens a step, tool.done
  // closes it. Labels come from getFriendlyToolStatus — technical tool ids
  // never reach the DOM. Message-scoped loop events share the message key.
  const scopeKey = scopeKeyFor(taskId);
  if (type === "tool.start" && typeof data?.name === "string") {
    const kind = stepKindForTool(data.name);
    if (kind) {
      const label = getFriendlyToolStatus(data.name, (data?.arguments || {}) as Record<string, unknown>) || "Working…";
      upsertStep(scopeKey, {
        id: typeof data?.id === "string" && data.id ? data.id : `${type}-${id ?? Date.now()}`,
        kind,
        label,
        status: "running",
        at: Date.now(),
      });
    }
  } else if (type === "tool.done" && typeof data?.name === "string") {
    const stepId = typeof data?.id === "string" && data.id ? data.id : null;
    const failed = Boolean(
      data?.result && typeof data.result === "object" && (data.result as Record<string, unknown>).success === false
    );
    if (stepId) {
      useConversationStore.setState((state) => {
        const existing = state.messageSteps[scopeKey] || [];
        if (!existing.some((s) => s.id === stepId)) return state;
        return {
          messageSteps: {
            ...state.messageSteps,
            [scopeKey]: existing.map((s) => (s.id === stepId ? { ...s, status: failed ? "error" : "done" } : s)),
          },
        };
      });
    }
  } else if (type === "plugin.created" || type === "plugin.updated" || type === "plugin.published") {
    const title =
      typeof data?.title === "string" ? data.title : typeof data?.name === "string" ? data.name : "tool";
    upsertStep(scopeKey, {
      id: `${type}-${id ?? Date.now()}`,
      kind: "build",
      label: type === "plugin.published" ? `Published "${title}".` : `Mounted "${title}" in the dock.`,
      status: "done",
      at: Date.now(),
    });
  } else if (type === "theme.apply") {
    upsertStep(scopeKey, {
      id: `${type}-${id ?? Date.now()}`,
      kind: "save",
      label: "Theme updated.",
      status: "done",
      at: Date.now(),
    });
  }

  const status = typeof data?.status === "string" ? data.status : type.replace(/^job\./, "");
  const known: TaskCard["status"][] = ["queued", "running", "awaiting_approval", "completed", "failed", "cancelled", "interrupted"];
  if (!known.includes(status)) return;

  const store = useConversationStore.getState();
  const prev = store.taskCards[taskId];
  const title = prev?.title || (typeof data?.prompt === "string" && data.prompt) || `Background job ${taskId.slice(0, 8)}`;
  const terminal = status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
  const alreadyTerminal = prev && ["completed", "failed", "cancelled", "interrupted"].includes(prev.status);

  const approvalId = typeof data?.approvalId === "string" && data.approvalId ? data.approvalId : prev?.approvalId;
  useConversationStore.setState((state) => ({
    taskCards: {
      ...state.taskCards,
      [taskId]: { taskId, title, status, approvalId, updatedAt: Date.now() },
    },
  }));

  if (terminal && !alreadyTerminal && !announcedJobs.has(taskId)) {
    announcedJobs.add(taskId);
    finishScopeSteps(scopeKey, status === "completed" ? "done" : "error");
    // Honest completion: announce the real effect summary carried on
    // job.completed, never the original prompt.
    const summary = typeof data?.summary === "string" && data.summary ? data.summary : null;
    const label =
      status === "completed"
        ? summary || `Done: ${title}.`
        : status === "failed"
          ? `The background job failed${data?.error ? `: ${data.error}` : "."}`
          : status === "cancelled"
            ? `The background job was cancelled.`
            : `The background job was interrupted (server restarted).`;
    useConversationStore.setState((state) => ({
      messages: [...state.messages, { id: crypto.randomUUID(), role: "assistant", content: label, timestamp: Date.now() }],
    }));
  }
}

/** Streaming message placeholder keyed by server message id. */
function handleMessageSseEvent(messageId: string, type: string, data: any): void {
  const key = `m-${messageId}`;
  const set = useConversationStore.setState;
  if (type === "message.delta" && typeof data?.text === "string") {
    // Pre-tool narration rides as thinking: collapsible, never chat text.
    if ((data as Record<string, unknown>)?.thinking === true) {
      set((state) => ({
        messageThinking: {
          ...state.messageThinking,
          [key]: (state.messageThinking[key] || "") + data.text,
        },
      }));
      return;
    }
    set((state) => {
      const existing = state.messages.find((m) => m.id === key);
      if (existing) {
        return {
          messages: state.messages.map((m) =>
            m.id === key ? { ...m, content: (m.content || "") + data.text, streaming: true } : m
          ),
        };
      }
      return {
        messages: [...state.messages, { id: key, role: "assistant" as const, content: data.text, streaming: true, timestamp: Date.now() }],
      };
    });
    return;
  }
  if (type === "message.done") {
    finishScopeSteps(key, "done");
    if (data && typeof data === "object" && (data as any).action) {
      const reply = (data as any).action as { op?: string; id?: string };
      const dock = useDockStore.getState();
      if (reply.op === "open" && reply.id) dock.openTool(reply.id);
      else if (reply.op === "close" && reply.id) dock.closeTool(reply.id);
    }
    if (data && typeof data === "object" && typeof (data as any).taskId === "string") {
      const tid = (data as any).taskId as string;
      const prompt = typeof (data as any)?.prompt === "string" ? (data as any).prompt.slice(0, 80) : undefined;
      set((state) => ({
        taskCards: {
          ...state.taskCards,
          [tid]: {
            taskId: tid,
            title: prompt || state.taskCards[tid]?.title || `Background job ${tid.slice(0, 8)}`,
            status: state.taskCards[tid]?.status || ("queued" as const),
            updatedAt: Date.now(),
          },
        },
      }));
    }
    const text = typeof data?.text === "string" ? data.text : "Done.";
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === key ? { ...m, content: text, streaming: false } : m
      ),
    }));
    return;
  }
  if (type === "message.error") {
    const text = typeof data?.text === "string" ? data.text : "Something went wrong.";
    set((state) => {
      const exists = state.messages.some((m) => m.id === key);
      const next = exists
        ? state.messages.map((m) => (m.id === key ? { ...m, content: text, streaming: false } : m))
        : [...state.messages, { id: key, role: "assistant" as const, content: text, timestamp: Date.now() }];
      return { messages: next };
    });
  }
}

/**
 * Applies a reader.open UI event to the store. Exported so tests prove the
 * wiring: an emitted event with no listener here means the reader never
 * opens (the old browser.open hole).
 */
export function applyReaderOpened(event: {
  id?: string;
  mode?: "video" | "reader" | "embed" | "external";
  title?: string;
  url: string;
  workspaceId?: string;
  site?: string;
  image?: string | null;
  markdown?: string;
  embedUrl?: string;
  reason?: string;
}): void {
  useConversationStore.getState().openReader({
    sourceId: event.id,
    mode: event.mode || "external",
    title: event.title || event.url,
    url: event.url,
    workspaceId: event.workspaceId,
    site: event.site,
    image: event.image ?? undefined,
    markdown: event.markdown,
    embedUrl: event.embedUrl,
    reason: event.reason,
  });
}
