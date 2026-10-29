import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { Orb } from "./Orb";
import { ModelSwitcher } from "./ModelSwitcher";
import { AttachmentStagingBar, MessageAttachments } from "./ChatAttachments";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import {
  connectRealtimeVoice,
  createMicPcmStreamer,
  type MicPcmStreamer,
} from "@/lib/agent/realtimeVoice";
import { spring, prefersReducedMotion } from "@/lib/motion";

interface AgentConversationProps {
  cityId?: string;
  onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
  onOpenExperience?: (expId: string) => void;
}

export function AgentConversation({
  cityId,
  onExperienceCreated,
  onOpenExperience,
}: AgentConversationProps) {
  const {
    layoutState,
    sideWidth,
    messages,
    stagedAttachments,
    draft,
    isStreaming,
    statusText,
    activeApproval,
    soundEnabled,
    audioLevel,
    orbState,
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
  } = useConversationStore();

  const { dockPosition } = useThemeStore();
  const isBottom = dockPosition === "bottom";

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const [isDraggingWidth, setIsDraggingWidth] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const sheetTranscriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<{ close: () => void; stopMic: () => void } | null>(null);

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

  // Handle auto-scroll during streaming
  useEffect(() => {
    if (layoutState === "closed") return;
    const el = layoutState === "sheet" ? sheetTranscriptRef.current : transcriptRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom || isStreaming) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowScrollBottom(false);
    }
  }, [messages, isStreaming, statusText, layoutState]);

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

    setOrbState("listening");
    setStatusText("Listening… speak now. Tap the Orb to stop.");

    try {
      const session = connectRealtimeVoice({
        onPartial: (text) => setDraft(text),
        onFinal: (text) => {
          if (!text.trim()) return;
          setDraft("");
          void sendMessage(text, cityId, { onExperienceCreated, onOpenExperience });
        },
        onLevel: (level) => setAudioLevel(level),
        onError: (message) => {
          setStatusText(message);
          setOrbState("error");
          window.setTimeout(() => {
            if (!realtimeRef.current) setOrbState("idle");
          }, 2500);
        },
        onClose: () => {
          realtimeRef.current = null;
          setOrbState("idle");
          setStatusText("");
        },
      });

      const streamer: MicPcmStreamer = await createMicPcmStreamer(
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
  }, [cityId, onExperienceCreated, onOpenExperience, sendMessage, setAudioLevel, setDraft, setOrbState, setStatusText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      sendMessage(undefined, cityId, { onExperienceCreated, onOpenExperience });
    }
  };

  // Drag-to-resize side width
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingWidth(true);
    const startX = e.clientX;
    const startWidth = sideWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setSideWidth(startWidth + deltaX);
    };

    const handleMouseUp = () => {
      setIsDraggingWidth(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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
            "fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto select-none",
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
                <span className="text-xs font-semibold text-white/90 tracking-tight font-sans">
                  Polymax Agent
                </span>
                {isStreaming && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-lime)] font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)] animate-ping" />
                    <span>Thinking…</span>
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
                    onClick={() => handleApproval(true, cityId, { onExperienceCreated, onOpenExperience })}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Allow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproval(false, cityId, { onExperienceCreated, onOpenExperience })}
                    className="px-2.5 py-1 rounded-md text-xs bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Transcript Box: native overflow viewport (flex-1 shrinks;
                generous bottom pad so rows never slide behind the composer) */}
            <div
              ref={sheetTranscriptRef}
              className="relative z-0 my-3 min-h-0 flex-1 max-h-64 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--border-subtle)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border-subtle)]"
            >
              <div className="px-1 pt-1 pb-24 space-y-2.5 select-text">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                  <p className="text-xs text-[#9aa5b8]">
                    {isHydratingThread
                      ? "Restoring your conversation…"
                      : "Speak or type to research topics, build tools, or explore your workspace."}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isTool = msg.role === "tool";

                  if (isTool) {
                    return (
                      <div
                        key={msg.id}
                        className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/70 py-0.5"
                      >
                        <span className="text-[var(--accent-lime)] text-[9px]">✦</span>
                        <span className="truncate">{msg.content}</span>
                      </div>
                    );
                  }

                  if (isUser) {
                    return (
                      <div key={msg.id} className="flex flex-col items-end gap-1">
                        <div className="max-w-[85%] rounded-2xl px-3.5 pt-1.5 pb-2 bg-white/[0.08] text-white text-xs leading-relaxed text-pretty">
                          {msg.content}
                        </div>
                        <MessageAttachments attachments={msg.attachments} />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className="prose prose-invert prose-sm max-w-none pr-2 pb-1 leading-relaxed prose-h1:text-sm prose-h2:text-sm prose-h3:text-xs"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--accent-lime)] hover:underline"
                            >
                              {children}
                            </a>
                          ),
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const isInline = !match && !String(children).includes("\n");
                            if (isInline) {
                              return (
                                <code
                                  className="px-1 py-0.5 rounded bg-white/10 font-mono text-[11px] text-[var(--accent-lime)]"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <pre className="my-1.5 p-2 rounded-lg bg-black/60 border border-white/5 font-mono text-[11px] overflow-x-auto text-[#e2e8f0]">
                                <code>{children}</code>
                              </pre>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  );
                })
              )}

              {/* Status indicator during streaming */}
              {isStreaming && statusText && (
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-lime)] py-1">
                  <span className="animate-spin text-xs">✦</span>
                  <span className="truncate">{statusText}</span>
                </div>
              )}
              </div>
            </div>

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
                sendMessage(undefined, cityId, { onExperienceCreated, onOpenExperience });
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

                {/* Single Orb: realtime voice toggle with pulsing active state */}
                <button
                  type="button"
                  onClick={() => {
                    if (isStreaming) abortStream();
                    else void toggleVoice();
                  }}
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0",
                    orbState === "listening"
                      ? "bg-red-500/20 text-red-400"
                      : "hover:bg-white/10 text-muted-foreground hover:text-white"
                  )}
                  title={orbState === "listening" ? "Listening… (click to stop)" : "Voice input"}
                >
                  <Orb state={orbState} size="sm" audioLevel={audioLevel} className="scale-65" />
                </button>

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
                <ModelSwitcher compact align="start" />
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
          className={cn(
            "absolute top-0 bottom-0 -right-1.5 w-3 cursor-col-resize z-50 group hover:bg-[var(--accent-lime)]/20 transition-colors",
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
              return (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-xs font-mono text-muted-foreground/80 py-1"
                >
                  <span className="text-[var(--accent-lime)] text-[10px]">✦</span>
                  <span>{msg.content}</span>
                </div>
              );
            }

            if (isUser) {
              return (
                <div key={msg.id} className="flex flex-col items-end gap-1.5 w-full">
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
                          onClick={() => retryLast(cityId, { onExperienceCreated, onOpenExperience })}
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
                className="group relative w-full prose prose-invert max-w-none leading-relaxed prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-strong:text-foreground prose-th:p-1 prose-table:-mx-2"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // The custom `code` renderer draws its own code block; let it
                    // through without the default <pre> wrapper (and prose styling)
                    pre: ({ children }) => <>{children}</>,
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent-lime)] hover:underline underline-offset-4"
                      >
                        {children}
                      </a>
                    ),
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const isInline = !match && !String(children).includes("\n");
                      if (isInline) {
                        return (
                          <code
                            className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs text-[var(--accent-lime)]"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <div className="relative my-3 rounded-xl bg-black/60 border border-white/10 overflow-hidden font-mono text-xs">
                          <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/5 border-b border-white/5 text-muted-foreground text-[11px]">
                            <span>{match?.[1] || "code"}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ""))}
                              className="hover:text-white transition-colors cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="p-3.5 overflow-x-auto text-[#e2e8f0]">
                            <code>{children}</code>
                          </pre>
                        </div>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>

                {/* Hover actions: Copy & Retry on last message */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3 pt-2 text-xs font-mono text-muted-foreground">
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
                      onClick={() => retryLast(cityId, { onExperienceCreated, onOpenExperience })}
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

          {/* Transient status line during streaming */}
          {isStreaming && statusText && (
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-lime)] py-1">
              <span className="animate-spin text-xs">✦</span>
              <span>{statusText}</span>
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

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abortStream}
                    className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 flex items-center justify-center transition-all cursor-pointer"
                    title="Stop generation"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendMessage(undefined, cityId, { onExperienceCreated, onOpenExperience })}
                    disabled={!draft.trim() && stagedAttachments.length === 0}
                    className="w-9 h-9 rounded-xl bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer font-bold"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
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
