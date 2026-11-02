import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AssistantMarkdown, StreamingText } from "./StreamingText";
import {
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Send,
  Square,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { TINYFISH_LOGO_SRC, isTinyFishTool } from "@/lib/agent/events";
import { Orb } from "./Orb";
import { StepsTimeline } from "./StepsTimeline";
import { ModelSwitcher } from "./ModelSwitcher";
import { AttachmentStagingBar, MessageAttachments } from "./ChatAttachments";
import { useConversationStore, scopeKeyFor } from "@/lib/agent/conversationStore";
import { cancelSpeech } from "@/lib/agent/speech";
import { useThemeStore } from "@/lib/theme";
import {
  connectRealtimeVoice,
  createMicPcmStreamer,
  type MicPcmStreamer,
} from "@/lib/agent/realtimeVoice";
import { spring, prefersReducedMotion } from "@/lib/motion";

interface AgentConversationProps {
  onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
  onOpenExperience?: (expId: string) => void;
  onCloseExperience?: (expId: string) => void;
}

/**
 * Short display name for the model that produced a reply (visibility into
 * which model handled the task, including automatic vision routing).
 */
function modelShortName(modelId: string): string {
  const short = modelId.split("/").pop() || modelId;
  return short.length > 28 ? `${short.slice(0, 28)}…` : short;
}

/**
 * One-line summary for the collapsed sheet: streaming status, otherwise the
 * latest assistant reply (markdown stripped), otherwise the last user prompt.
 */
function shortSummary(
  messages: Array<{ role: string; content: string }>,
  isHydrating: boolean,
  isStreaming: boolean,
  statusText: string
): string {
  if (isStreaming && statusText) return statusText;
  if (isHydrating && messages.length === 0) return "Restoring your conversation…";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.trim()) {
      const line = m.content.split("\n").map((s) => s.trim()).find((s) => s.length > 0) || "";
      const clean = line.replace(/[`*_#[\]()!>-]/g, "").trim();
      if (!clean) return "Done.";
      return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
    }
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser?.content.trim()) {
    return lastUser.content.length > 140 ? `${lastUser.content.slice(0, 140)}…` : lastUser.content;
  }
  return "Speak or type to research topics, build tools, or explore your workspace.";
}

const CARD_DOT: Record<string, string> = {
  queued: "bg-white/40",
  running: "bg-[var(--accent-lime)] animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-rose-400",
  cancelled: "bg-white/40",
  interrupted: "bg-amber-400",
};

const CARD_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

function TaskCards({ cards }: { cards: Array<{ taskId: string; title: string; status: string }> }) {
  const visible = cards
    .filter((c) => c.status === "queued" || c.status === "running" || c.status === "failed" || c.status === "interrupted")
    .sort((a, b) => (a.taskId < b.taskId ? -1 : 1));
  const stepsByTask = useConversationStore((s) => s.messageSteps);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (visible.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-col gap-1" aria-live="polite" aria-label="Background jobs">
      {visible.map((card) => {
        const steps = stepsByTask[scopeKeyFor(card.taskId)] || [];
        const isOpen = expanded === card.taskId;
        return (
        <div
          key={card.taskId}
          className="rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs text-white/80"
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CARD_DOT[card.status] || "bg-white/40"}`} aria-hidden />
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : card.taskId)}
              className="min-w-0 flex-1 truncate text-left hover:text-white transition-colors cursor-pointer"
              title={card.title}
              aria-expanded={isOpen}
            >
              {card.title}
            </button>
            <span className="shrink-0 text-white/40">{CARD_LABEL[card.status] || card.status}</span>
            {(card.status === "queued" || card.status === "running") && (
              <button
                type="button"
                onClick={() => {
                  void fetch(`/api/tasks/${encodeURIComponent(card.taskId)}/cancel`, { method: "POST" }).catch(() => {});
                }}
                className="shrink-0 text-white/40 hover:text-white hover:underline cursor-pointer"
                aria-label={`Cancel ${card.title}`}
              >
                Cancel
              </button>
            )}
          </div>
          {isOpen && steps.length > 0 && (
            <div className="pt-1.5 pl-3.5">
              <StepsTimeline steps={steps} defaultOpen />
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

export function AgentConversation({
  onExperienceCreated,
  onOpenExperience,
  onCloseExperience,
}: AgentConversationProps) {
  const {
    layoutState,
    sideWidth,
    messages,
    stagedAttachments,
    draft,
    isStreaming,
    statusText,
    activity,
    lastEventAt,
    currentPhase,
    streamingText,
    activeApproval,
    pendingVoiceStart,
    activeModel,
    soundEnabled,
    audioLevel,
    orbState,
    taskCards,
    messageSteps,
    messageThinking,
    isHydratingThread,
    isLoadingOlder,
    hasOlderMessages,
    setLayoutState,
    setSideWidth,
    setDraft,
    addAttachments,
    removeAttachment,
    setSoundEnabled,
    setAudioLevel,
    setOrbState,
    setStatusText,
    sendMessage,
    retryLast,
    abortStream,
    handleApproval,
    loadOlderMessages,
    clearConversation,
    consumeVoiceStart,
  } = useConversationStore();

  const { dockPosition } = useThemeStore();
  const isBottom = dockPosition === "bottom";

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const [isDraggingWidth, setIsDraggingWidth] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<{ close: () => void; stopMic: () => void } | null>(null);
  // One-shot anchor: expanding to full/side lands on the last user message,
  // never at the top after a reload. Reset when leaving the expanded views.
  const anchoredRef = useRef(false);

  // Live clock for activity elapsed times + the stuck message. Ticks only
  // while a turn is streaming.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isStreaming) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isStreaming]);

  const stuckSecs =
    isStreaming && lastEventAt > 0 ? Math.max(0, Math.floor((now - lastEventAt) / 1000)) : 0;
  const isStuck = stuckSecs >= 8;
  const reduceMotion = prefersReducedMotion();

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        e.preventDefault();
        addAttachments(files);
      }
    },
    [addAttachments]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addAttachments(Array.from(e.dataTransfer.files));
      }
    },
    [addAttachments]
  );

  // Cleanup realtime voice session on unmount
  useEffect(() => {
    return () => {
      realtimeRef.current?.stopMic();
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };
  }, []);

  // Tracks whether the current/last voice attempt showed an error: the
  // close handler must not wipe it, or failures look like silence.
  const voiceErrorShownRef = useRef(false);

  // Auto-resize textarea from 1 to 6 lines (approx 24px to 144px)
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 24), 144);
    el.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  // Handle auto-scroll during streaming (expanded views only; the sheet
  // shows a compact Orb + summary instead of a transcript)
  useEffect(() => {
    if (layoutState === "closed" || layoutState === "sheet") return;
    const el = transcriptRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom || isStreaming) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowScrollBottom(false);
    }
  }, [messages, isStreaming, statusText, layoutState]);

  // Anchor expanded views on the last user message (once per open, after
  // hydration). Reloads never start at the top of the history.
  useEffect(() => {
    if (layoutState !== "full" && layoutState !== "side") {
      anchoredRef.current = false;
      return;
    }
    if (isHydratingThread || messages.length === 0 || isStreaming) return;
    if (anchoredRef.current) return;
    const container = transcriptRef.current;
    if (!container) return;
    anchoredRef.current = true;
    const users = container.querySelectorAll('[data-msg-role="user"]');
    const last = users[users.length - 1] as HTMLElement | undefined;
    if (!last) {
      container.scrollTo({ top: container.scrollHeight });
      return;
    }
    const cRect = container.getBoundingClientRect();
    const lRect = last.getBoundingClientRect();
    container.scrollTo({ top: container.scrollTop + (lRect.top - cRect.top) - 72 });
  }, [layoutState, isHydratingThread, messages, isStreaming]);

  // Track scroll position on the native transcript viewport
  useEffect(() => {
    if (layoutState !== "side" && layoutState !== "full") return;
    const el = transcriptRef.current;
    if (!el) return;

    const onViewportScroll = () => {
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBottom(distanceToBottom > 150);
    };

    onViewportScroll();
    el.addEventListener("scroll", onViewportScroll, { passive: true });
    return () => el.removeEventListener("scroll", onViewportScroll);
  }, [layoutState]);

  const scrollToBottom = () => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowScrollBottom(false);
  };

  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleVoice = useCallback(async () => {
    // Single Orb toggle: stop an active realtime session, else start one.
    if (realtimeRef.current) {
      realtimeRef.current.stopMic();
      realtimeRef.current.close();
      realtimeRef.current = null;
      setOrbState("idle");
      return;
    }

    if (typeof window === "undefined" || !("mediaDevices" in navigator)) {
      setStatusText("Voice input is not supported in this browser.");
      return;
    }

    // Stop any spoken reply first: without this the mic transcribes the
    // agent's own TTS voice into the next user turn (feedback loop).
    cancelSpeech();
    voiceErrorShownRef.current = false;

    // Single-shot voice command: the first final transcript stops the mic,
    // flushes the turn (endStream) and sends itself as a chat message.
    // Partials only preview into the draft — nothing sends twice.
    let sent = false;
    let busyHandoff = false;
    const stopSession = () => {
      realtimeRef.current?.stopMic();
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };

    // Order matters: open the session first so no mic audio is captured
    // without a live socket (and the mic light never turns on for a dead
    // session). The user sees Connecting → Listening, never silence.
    setOrbState("listening");
    setStatusText("Connecting to voice…");
    let session: ReturnType<typeof connectRealtimeVoice>;
    try {
      const conn = connectRealtimeVoice({
        onPartial: (text) => {
          if (!sent) setDraft(text);
        },
        onSpeechStart: () => {
          if (!sent) setStatusText("Listening…");
        },
        onSpeechEnd: () => {
          if (!sent) setStatusText("Understanding…");
        },
        onFinal: (text) => {
          const clean = text.trim();
          if (!clean || sent) return;
          sent = true;
          stopSession();
          // The orchestrator path never blocks, so voice input goes straight
          // through instead of parking in the draft.
          busyHandoff = false;
          setDraft("");
          setOrbState("idle");
          setStatusText("");
          void useConversationStore.getState().sendMessage(clean, { onExperienceCreated, onOpenExperience, onCloseExperience });
        },
        onLevel: (level) => setAudioLevel(level),
        onError: (message) => {
          voiceErrorShownRef.current = true;
          setStatusText(message);
          setOrbState("error");
          window.setTimeout(() => {
            if (!realtimeRef.current) setOrbState("idle");
          }, 2500);
        },
        onClose: () => {
          realtimeRef.current = null;
          setOrbState("idle");
          // Keep the busy-handoff message (words parked in the draft) and
          // any shown error: clearing the status would hide where the
          // words went, or make a failure look like silence.
          if (!busyHandoff && !voiceErrorShownRef.current) setStatusText("");
        },
      });
      session = conn;

      // Wait for the socket before touching the mic: early PCM frames would
      // be dropped silently, and the mic light must never turn on for a
      // dead session.
      try {
        await Promise.race([
          session.opened,
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("voice handshake timeout")), 12000)
          ),
        ]);
      } catch (err: any) {
        const detail = String(err?.message || "");
        setOrbState("idle");
        // A socket-level message is specific (auth, upstream failure);
        // only the local timeout needs the generic connection wording.
        setStatusText(
          detail && detail !== "voice handshake timeout"
            ? detail
            : "Could not reach the voice service. Check your connection and try again."
        );
        try {
          session.close();
        } catch {
          // Ignore
        }
        return;
      }

      let streamer: MicPcmStreamer;
      try {
        streamer = await createMicPcmStreamer(
          (pcm) => {
            if (session.ws.readyState === WebSocket.OPEN) {
              try {
                session.ws.send(pcm);
              } catch {
                // Ignore transient send failures
              }
            }
          },
          (level) => setAudioLevel(level)
        );
      } catch (err: any) {
        setOrbState("idle");
        setStatusText(
          err?.message || "Microphone unavailable. Allow microphone access and try again."
        );
        try {
          session.close();
        } catch {
          // Ignore
        }
        return;
      }
      // Mic is live: only now claim to be listening.
      setStatusText("Listening… speak now. Tap the Orb to stop.");

      realtimeRef.current = {
        stopMic: () => streamer.stop(),
        close: () => {
          try {
            if (session.ws.readyState === WebSocket.OPEN) {
              session.ws.send(JSON.stringify({ type: "endStream" }));
            }
          } catch {
            // Ignore
          }
          // Give the server a beat to flush final transcripts, then close.
          window.setTimeout(() => session.close(), 600);
        },
      };
    } catch {
      setOrbState("idle");
      setStatusText("Microphone permission denied.");
    }
  }, [onExperienceCreated, onOpenExperience, onCloseExperience, sendMessage, setAudioLevel, setDraft, setOrbState, setStatusText]);

  // Home orb entry: the orb click opens the panel and asks for voice.
  // Start listening once (never stop an active session from here).
  useEffect(() => {
    if (!pendingVoiceStart) return;
    consumeVoiceStart();
    if (!realtimeRef.current) void toggleVoice();
  }, [pendingVoiceStart, consumeVoiceStart, toggleVoice]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Never blocked: the orchestrator queues per session and answers fast.
      // Legacy streaming turns (attachments/retry) keep their own gate inside sendMessage.
      sendMessage(undefined, { onExperienceCreated, onOpenExperience, onCloseExperience });
    }
  };

  // Drag-to-resize side width (pointer capture: reliable across
  // window edges, touch-friendly; clamped to usable bounds).
  const startResize = (clientX: number) => {
    setIsDraggingWidth(true);
    const startX = clientX;
    const startWidth = sideWidth;
    const MIN_W = 320;
    const maxW = () => Math.max(MIN_W + 40, window.innerWidth - 120);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setSideWidth(Math.min(maxW(), Math.max(MIN_W, startWidth + deltaX)));
    };

    const handleMouseUp = () => {
      setIsDraggingWidth(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const t = moveEvent.touches[0];
      if (!t) return;
      setSideWidth(Math.min(maxW(), Math.max(MIN_W, startWidth + (t.clientX - startX))));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseUp);
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    startResize(e.clientX);
  };

  if (layoutState === "closed") return null;

  // =========================================================================
  // 1. SHEET MODE (Bottom-anchored capsule, unified voice + text + transcript)
  // =========================================================================
  if (layoutState === "sheet") {
    return (
      <AnimatePresence>
        <motion.div
          layoutId="polymax-agent-surface"
          initial={{ opacity: 0, y: prefersReducedMotion() ? 0 : 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: spring.soft }}
          exit={{ opacity: 0, y: 16, scale: 0.95, transition: { duration: 0.16 } }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto select-none flex flex-col items-center",
            isBottom ? "bottom-[calc(var(--dock-bottom-offset,88px)+12px)]" : "bottom-6"
          )}
        >
          <div className="relative w-full rounded-[24px] bg-[#0c1017]/95 border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl p-4 overflow-hidden flex flex-col max-h-[calc(100dvh-120px)]">
            {/* Header: status on left, mute/expand/close on right (no Orb here — single Orb lives in the composer) */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "w-2 h-2 rounded-full",
                    orbState === "listening" || orbState === "speaking"
                      ? "bg-[var(--accent-lime)] animate-pulse"
                      : orbState === "thinking"
                        ? "bg-[var(--accent-lime)]/70 animate-ping"
                        : orbState === "error"
                          ? "bg-red-400"
                          : "bg-white/25"
                  )}
                />
                {isStreaming && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-lime)] font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)] animate-ping" />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title={soundEnabled ? "Mute audio" : "Unmute audio"}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (messages.length === 0 || window.confirm("Clear this conversation? The same chat stays open.")) {
                      void clearConversation();
                    }
                  }}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title="Clear conversation (keeps the same chat)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutState("full")}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title="Expand to full chat"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutState("closed")}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Approval Banner if active */}
            {activeApproval && (
              <div className="my-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
                <p className="text-xs font-medium text-amber-300">
                  {activeApproval.message}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproval(true, { onExperienceCreated, onOpenExperience, onCloseExperience })}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproval(false, { onExperienceCreated, onOpenExperience, onCloseExperience })}
                    className="px-2.5 py-1 rounded-md text-xs bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Compact status: single Orb (voice toggle) + short summary.
                The collapsed sheet never renders the transcript, so a reload
                can't start at the top — tap to expand the full conversation. */}
            <div className="my-3 flex items-center gap-3 rounded-2xl bg-black/30 border border-white/[0.07] pl-1.5 pr-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  if (isStreaming) abortStream();
                  else void toggleVoice();
                }}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0",
                  orbState === "listening"
                    ? "bg-red-500/20 text-red-400"
                    : "hover:bg-white/10 text-muted-foreground hover:text-white"
                )}
                title={orbState === "listening" ? "Listening… (click to stop)" : "Voice input"}
              >
                {/* Shared with the home orb: opening chat morphs it here. */}
                <motion.div
                  layoutId={reduceMotion ? undefined : "agent-orb-shared"}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="flex items-center justify-center"
                >
                  <Orb state={orbState} size="xs" audioLevel={audioLevel} />
                </motion.div>
              </button>

              <button
                type="button"
                onClick={() => setLayoutState("full")}
                className="flex-1 min-w-0 text-left cursor-pointer group/summary"
                title="Expand full conversation"
              >
                <p className="text-xs text-white/85 leading-snug truncate font-sans">
                  {shortSummary(messages, isHydratingThread, isStreaming, statusText)}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/70 group-hover/summary:text-muted-foreground transition-colors">
                  {messages.length > 0
                    ? `${messages.length} messages${activeModel ? ` · ${modelShortName(activeModel)}` : ""} · tap to expand`
                    : "Tap to expand"}
                </p>
              </button>

              {isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)] animate-ping shrink-0" />
              )}
            </div>

            {isStreaming && isStuck && (
              <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-mono text-muted-foreground">
                <span>
                  Still working: {(currentPhase || "thinking").toLowerCase()} ({stuckSecs}s)
                </span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={abortStream}
                  className="text-[var(--accent-lime)] hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Staging bar for attachments */}
            {stagedAttachments.length > 0 && (
              <AttachmentStagingBar
                attachments={stagedAttachments}
                onRemove={removeAttachment}
                className="mb-1 rounded-xl"
              />
            )}

            {/* Unified Composer: input row + footer toolbar (grid coexistence, layered above transcript) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isStreaming) {
                  abortStream();
                  return;
                }
                if (!draft.trim() && stagedAttachments.length === 0) return;
                sendMessage(undefined, { onExperienceCreated, onOpenExperience, onCloseExperience });
              }}
              className="relative z-10 shrink-0 flex flex-col gap-1 bg-black/40 border border-white/10 rounded-2xl p-1.5 focus-within:border-[var(--accent-lime)]/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Attach photo or document"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>

                {/* Single Orb lives in the summary row above — composer keeps attach + input + send */}
                <input
                  ref={sheetInputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="Ask anything, or give a dock command…"
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-xs text-white placeholder-[#9aa5b8] focus:outline-none font-sans"
                  autoFocus
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abortStream}
                    className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title="Stop generation"
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim() && stagedAttachments.length === 0}
                    className="w-7 h-7 rounded-lg bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shrink-0 font-bold"
                    title="Send message"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-start pl-1">
                <ModelSwitcher align="start" />
              </div>
            </form>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // =========================================================================
  // 2. FULL-SCREEN OR SIDE-BY-SIDE CHAT COLUMN
  // =========================================================================
  const isSide = layoutState === "side";

  return (
    <motion.div
      layoutId="polymax-agent-surface"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: spring.soft }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      style={isSide ? { width: `${sideWidth}px` } : undefined}
      className={cn(
        "relative flex flex-col bg-[var(--bg-void)]/96 backdrop-blur-2xl transition-all duration-150 select-text",
        isSide
          ? "fixed top-0 bottom-0 left-0 z-40 border-r border-white/5 shadow-2xl"
          : "fixed inset-0 z-40 w-full",
        isBottom && "pb-[calc(var(--dock-bottom-offset,88px)+8px)]"
      )}
    >
      {/* Resizable drag edge for side-by-side mode */}
      {isSide && (
        <div
          onMouseDown={handleMouseDownResize}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) startResize(t.clientX);
          }}
          className={cn(
            "absolute top-0 bottom-0 -right-1.5 w-3 cursor-col-resize z-50 group hover:bg-[var(--accent-lime)]/20 transition-colors touch-none select-none",
            isDraggingWidth && "bg-[var(--accent-lime)]/30"
          )}
          title="Drag to resize chat width"
        >
          <div className="w-[2px] h-full mx-auto bg-transparent group-hover:bg-[var(--accent-lime)] transition-colors" />
        </div>
      )}

      {/* Controls aligned below the dock line, part of the panel layout (no overlay fades) */}
      <div
        className={cn(
          "shrink-0 flex items-center justify-end gap-1.5 px-4 sm:px-8 pb-3",
          isBottom ? "pt-4" : "pt-[calc(var(--dock-top-offset,88px)+12px)]"
        )}
      >
        {!isSide && (
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? "Mute spoken replies" : "Unmute spoken replies"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (messages.length === 0 || window.confirm("Clear this conversation? The same chat stays open.")) {
              void clearConversation();
            }
          }}
          className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
          title="Clear conversation (keeps the same chat)"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setLayoutState(isSide ? "full" : "sheet")}
          className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
          title={isSide ? "Expand to full screen" : "Collapse to sheet"}
        >
          {isSide ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => setLayoutState("closed")}
          className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
          title="Close conversation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Transcript Area (z-0; bottom-padded so final rows clear the footer composer) */}
      <div
        ref={transcriptRef}
        className={cn(
          "relative z-0 flex-1 min-h-0 w-full overflow-y-auto overscroll-contain px-4 sm:px-6 [scrollbar-width:thin] [scrollbar-color:var(--border-subtle)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)]",
          !isSide && "max-w-[720px] mx-auto"
        )}
      >
        <div className="w-full pt-3 pb-32">
        {/* Scroll-back inside the same thread: never a new conversation */}
        {hasOlderMessages && (
          <div className="flex justify-center pb-4">
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              disabled={isLoadingOlder}
              className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-mono text-muted-foreground hover:text-white hover:bg-white/[0.08] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isLoadingOlder ? "Loading earlier turns…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {/* Empty State: text only (single Orb lives in the composer) */}
        {messages.length === 0 && (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-white/85 font-sans">Ask anything to start.</p>
            <p className="text-xs font-mono text-muted-foreground">
              Tap the Orb in the composer below to dictate.
            </p>
            {isHydratingThread && (
              <span className="text-xs font-mono text-muted-foreground">
                Restoring your conversation…
              </span>
            )}
          </div>
        )}

        {/* Message items */}
        <div className="space-y-6">
          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const isTool = msg.role === "tool";
            const isLastMessage = idx === messages.length - 1;

            if (isTool) {
              const branded =
                (msg.toolName && isTinyFishTool(msg.toolName)) || msg.content.includes("TinyFish");
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-xs font-mono text-muted-foreground/80 py-1"
                >
                  {branded ? (
                    <img
                      src={TINYFISH_LOGO_SRC}
                      alt="TinyFish"
                      width={14}
                      height={14}
                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="text-[var(--accent-lime)] text-[10px]">✦</span>
                  )}
                  <span>{msg.content}</span>
                </div>
              );
            }

            if (isUser) {
              return (
                <div
                  key={msg.id}
                  data-msg-role="user"
                  data-msg-id={msg.id}
                  className="flex flex-col items-end gap-1.5 w-full"
                >
                  <div className="max-w-[75%] rounded-[20px] px-4 pt-2.5 pb-3 bg-white/[0.08] text-[#f1f3f9] text-base font-sans backdrop-blur-md leading-relaxed text-pretty shadow-sm">
                    {msg.content}
                  </div>
                  <MessageAttachments attachments={msg.attachments} />

                  {/* Inline Error under user message */}
                  {msg.error && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono pt-0.5">
                      <span className={msg.error.code === "model_unauthorized" ? "text-amber-400" : "text-red-400"}>
                        {msg.error.message}
                      </span>
                      {msg.error.code !== "model_unauthorized" && (
                        <button
                          type="button"
                          onClick={() => retryLast({ onExperienceCreated, onOpenExperience, onCloseExperience })}
                          className="underline hover:text-white transition-colors cursor-pointer"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // Agent Message: Plain text on backdrop, no bubble, markdown, copy & retry on hover
            return (
              <div
                key={msg.id}
                data-msg-role="assistant"
                data-msg-id={msg.id}
                className="group relative w-full prose prose-invert max-w-none leading-relaxed prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-strong:text-foreground prose-th:p-1"
              >
                <StepsTimeline steps={messageSteps[msg.id] || []} thinking={messageThinking[msg.id]} />
                <AssistantMarkdown content={msg.content} />

                {/* Hover actions: Copy & Retry on last message */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3 pt-2 text-xs font-mono text-muted-foreground">
                  {msg.model && (
                    <span className="text-[10px] text-muted-foreground/60" title={`Answered by ${msg.model}`}>
                      {modelShortName(msg.model)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                    title="Copy response"
                  >
                    {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === msg.id ? "Copied" : "Copy"}</span>
                  </button>

                  {isLastMessage && !isStreaming && (
                    <button
                      type="button"
                      onClick={() => retryLast({ onExperienceCreated, onOpenExperience, onCloseExperience })}
                      className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                      title="Retry message"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live progress during streaming: one row per step, then the stuck line */}
          {isStreaming && (
            <div className="flex flex-col gap-1 py-1" aria-live="polite">
              {streamingText && (
                <StreamingText text={streamingText} streaming />
              )}
              {activity.map((row) => {
                const elapsed = Math.max(
                  0,
                  Math.floor(((row.finishedAt ?? now) - row.startedAt) / 1000)
                );
                const branded =
                  (row.tool && isTinyFishTool(row.tool)) || row.label.includes("TinyFish");
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 text-xs font-mono text-muted-foreground"
                  >
                    {branded ? (
                      <img
                        src={TINYFISH_LOGO_SRC}
                        alt="TinyFish"
                        width={14}
                        height={14}
                        className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                      />
                    ) : row.state === "running" ? (
                      <span
                        className={cn(
                          "text-[var(--accent-lime)] text-[10px]",
                          !reduceMotion && "animate-spin inline-block"
                        )}
                      >
                        ✦
                      </span>
                    ) : row.state === "done" ? (
                      <Check className="w-3 h-3 text-[var(--accent-lime)]" />
                    ) : (
                      <X className="w-3 h-3 text-red-400" />
                    )}
                    <span className="truncate">{row.label}</span>
                    <span className="text-muted-foreground/60 shrink-0">{elapsed}s</span>
                  </div>
                );
              })}
              {activity.length === 0 && (statusText || currentPhase) && (
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-lime)]">
                  {(statusText || "").includes("TinyFish") ? (
                    <img
                      src={TINYFISH_LOGO_SRC}
                      alt="TinyFish"
                      width={14}
                      height={14}
                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className={cn(!reduceMotion && "animate-spin inline-block")}
                    >
                      ✦
                    </span>
                  )}
                  <span>{statusText || currentPhase}</span>
                </div>
              )}
              {isStuck && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground pt-1">
                  <span>
                    Still working: {(currentPhase || "thinking").toLowerCase()} ({stuckSecs}s)
                  </span>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={abortStream}
                    className="text-[var(--accent-lime)] hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Floating Scroll to Bottom button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-30 p-2 rounded-full bg-[#181d28]/90 border border-white/10 shadow-lg text-muted-foreground hover:text-white hover:scale-105 transition-all cursor-pointer",
            isBottom ? "bottom-[calc(var(--dock-bottom-offset,88px)+84px)]" : "bottom-28"
          )}
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Composer: bottom-anchored footer band with solid blur background (z-10 above transcript) */}
      <div
        className={cn(
          "relative z-10 shrink-0 px-4 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pointer-events-auto bg-[var(--bg-void)]/85 backdrop-blur-xl",
          !isSide && "w-full max-w-[720px] mx-auto"
        )}
      >
        {/* Staging bar above composer */}
        {stagedAttachments.length > 0 && (
          <AttachmentStagingBar
            attachments={stagedAttachments}
            onRemove={removeAttachment}
            className="mb-1 rounded-t-[24px] rounded-b-none border-b-0"
          />
        )}

        {/* Background job cards (resumable SSE; input stays enabled) */}
        <TaskCards cards={Object.values(taskCards)} />

        <div
          className={cn(
            "relative flex flex-col bg-[var(--bg-surface)]/90 border border-white/10 p-2 shadow-lg backdrop-blur-2xl focus-within:border-[var(--accent-lime)]/50 transition-colors",
            stagedAttachments.length > 0 ? "rounded-b-[24px] rounded-t-none" : "rounded-[24px]"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag-and-drop overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-10 rounded-[24px] bg-[var(--accent-lime)]/10 border-2 border-dashed border-[var(--accent-lime)]/50 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 text-[var(--accent-lime)] text-sm font-medium">
                <UploadCloud className="w-5 h-5" />
                <span>Drop files here</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-1">
            <div className="flex items-end gap-1">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask anything"
                className="flex-1 min-w-0 bg-transparent px-3.5 pt-2 pb-1 text-sm sm:text-base text-white placeholder-muted-foreground focus:outline-none resize-none font-sans max-h-36 leading-relaxed"
              />
              <div className="flex items-center gap-1 pb-1 pr-1 shrink-0">
                {/* Single Orb: realtime voice toggle */}
                <button
                  type="button"
                  onClick={() => void toggleVoice()}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                  title={orbState === "listening" ? "Listening… (click to stop)" : "Voice input"}
                >
                  <Orb state={orbState} size="sm" audioLevel={audioLevel} className="scale-75" />
                </button>

                {isStreaming && (
                  <button
                    type="button"
                    onClick={abortStream}
                    className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 flex items-center justify-center transition-all cursor-pointer"
                    title="Stop generation"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => sendMessage(undefined, { onExperienceCreated, onOpenExperience, onCloseExperience })}
                  disabled={!draft.trim() && stagedAttachments.length === 0}
                  className="w-9 h-9 rounded-xl bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer font-bold"
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Footer toolbar: model/effort picker left, attachments right — coexists with input via grid */}
            <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
              <ModelSwitcher align="start" />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                  title="Attach image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.sh,.pdf,.png,.jpg,.jpeg,.webp,.gif,.svg"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addAttachments(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addAttachments(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}
