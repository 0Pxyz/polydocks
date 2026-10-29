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
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Orb } from "./Orb";
import { ModelSwitcher } from "./ModelSwitcher";
import { AttachmentStagingBar, MessageAttachments } from "./ChatAttachments";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { startVoiceInput, type VoiceRecognitionHandle } from "@/lib/agent/speech";
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
  const [isKeyboardInSheet, setIsKeyboardInSheet] = useState<boolean>(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const voiceHandleRef = useRef<VoiceRecognitionHandle | null>(null);

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

  // Dropping files on the capsule reveals the composer so the staged files are visible
  const handleSheetDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setIsKeyboardInSheet(true);
      }
      handleDrop(e);
    },
    [handleDrop]
  );

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
    if (layoutState !== "side" && layoutState !== "full") return;
    const el = transcriptRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom || isStreaming) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowScrollBottom(false);
    }
  }, [messages, isStreaming, statusText, layoutState]);

  // Track scroll position natively on the Radix ScrollArea viewport (React
  // does not delegate scroll events to it)
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

  const toggleVoice = () => {
    if (orbState === "listening") {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setOrbState("idle");
      return;
    }

    setOrbState("listening");
    const handle = startVoiceInput(
      (transcript, isFinal) => {
        setDraft(transcript);
        if (isFinal) {
          sendMessage(transcript, cityId, { onExperienceCreated, onOpenExperience });
        }
      },
      (level) => setAudioLevel(level),
      () => {
        setOrbState("idle");
      },
      () => {
        setOrbState("idle");
      }
    );

    if (handle) {
      voiceHandleRef.current = handle;
    } else {
      setOrbState("idle");
    }
  };

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
  // 1. SHEET MODE (Bottom-anchored capsule: orb first, typing on demand)
  // =========================================================================
  if (layoutState === "sheet") {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
    const displayText = isStreaming ? statusText : lastAssistantMsg?.content || "";
    const hasStaged = stagedAttachments.length > 0;

    return (
      <AnimatePresence>
        <motion.div
          layoutId="polymax-agent-surface"
          initial={{ opacity: 0, y: prefersReducedMotion() ? 0 : 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: spring.soft }}
          exit={{ opacity: 0, y: 16, scale: 0.95, transition: { duration: 0.16 } }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleSheetDrop}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto",
            isBottom ? "bottom-[calc(var(--dock-bottom-offset,88px)+12px)]" : "bottom-6"
          )}
        >
          <div className="relative w-full rounded-[28px] bg-[#0c1017]/92 border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl p-5 overflow-hidden">
            {/* Top Left: Close to dock */}
            <button
              type="button"
              onClick={() => setLayoutState("closed")}
              className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer z-10"
              title="Close to dock"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Top Right: thread controls + expand */}
            <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
              <ModelSwitcher compact className="h-6 text-[11px] px-1.5 mr-1" />
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
            </div>

            {/* Upper text: streamed reply or pending approval */}
            <div className="pt-2 px-10 pb-2 min-h-[44px] flex items-center justify-center text-center">
              {activeApproval ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-amber-300">
                    {activeApproval.message}
                  </p>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleApproval(true, cityId, { onExperienceCreated, onOpenExperience })}
                      className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproval(false, cityId, { onExperienceCreated, onOpenExperience })}
                      className="px-3 py-1 rounded-lg text-xs font-mono bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : displayText ? (
                <p className="text-sm line-clamp-3 text-foreground font-sans select-text transition-colors">
                  {displayText}
                </p>
              ) : null}
            </div>

            {/* Center Area: Orb (or compact mic when in keyboard mode) */}
            <div className="py-2 flex justify-center items-center">
              {!isKeyboardInSheet ? (
                <Orb
                  state={orbState}
                  size="md"
                  audioLevel={audioLevel}
                  onClick={() => {
                    if (isStreaming) abortStream();
                    else toggleVoice();
                  }}
                />
              ) : null}
            </div>

            {/* Staged attachments stay visible while the orb is shown */}
            {!isKeyboardInSheet && hasStaged && (
            {/* Scrollable Transcript Box */}
            <ScrollArea
              viewportRef={sheetTranscriptRef}
              className="my-3 max-h-64 min-h-[72px] [&_[data-slot=scroll-area-scrollbar]]:w-2 [&_[data-slot=scroll-area-scrollbar]]:p-0 [&_[data-slot=scroll-area-scrollbar]]:border-l-0 [&_[data-slot=scroll-area-thumb]]:bg-[var(--border-subtle)] [&_[data-slot=scroll-area-thumb]:hover]:bg-[var(--border-hover)]"
            >
              <div className="px-1 space-y-2.5 select-text scroll-smooth">
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
                        <div className="max-w-[85%] rounded-2xl px-3.5 py-1.5 bg-white/[0.08] text-white text-xs leading-relaxed">
                          {msg.content}
                        </div>
                        <MessageAttachments attachments={msg.attachments} />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className="prose prose-invert prose-sm max-w-none pr-2 leading-relaxed prose-h1:text-sm prose-h2:text-sm prose-h3:text-xs"
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
            </ScrollArea>

              <AttachmentStagingBar
                attachments={stagedAttachments}
                onRemove={removeAttachment}
                className="mb-1 rounded-xl"
              />
            )}

            {/* Input row in keyboard mode */}
            {isKeyboardInSheet && (
              <>
                {hasStaged && (
                  <AttachmentStagingBar
                    attachments={stagedAttachments}
                    onRemove={removeAttachment}
                    className="mt-2 rounded-xl"
                  />
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isStreaming) {
                      abortStream();
                      return;
                    }
                    if (!draft.trim() && !hasStaged) return;
                    sendMessage(undefined, cityId, { onExperienceCreated, onOpenExperience });
                  }}
                  className="mt-3 flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-2xl p-1.5 focus-within:border-[var(--accent-lime)]/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all cursor-pointer shrink-0"
                    title="Attach photo or document"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0",
                      orbState === "listening"
                        ? "bg-red-500/20 text-red-400"
                        : "text-muted-foreground hover:text-white hover:bg-white/10"
                    )}
                    title={orbState === "listening" ? "Listening… (click to stop)" : "Voice input"}
                  >
                    <Orb state={orbState} size="sm" className="scale-60" />
                  </button>
                  <input
                    ref={sheetInputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Ask anything, or give a dock command…"
                    className="flex-1 min-w-0 bg-transparent px-2 py-1 text-sm text-white placeholder-muted-foreground focus:outline-none font-sans"
                    autoFocus
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={abortStream}
                      className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all cursor-pointer shrink-0"
                      title="Stop generation"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!draft.trim() && !hasStaged}
                      className="p-2 rounded-xl bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer font-bold shrink-0"
                      title="Send message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              </>
            )}

            {/* Bottom Actions: sound · model · keyboard mode */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer shrink-0"
                title={soundEnabled ? "Mute audio" : "Unmute audio"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <ModelSwitcher compact />

              <button
                type="button"
                onClick={() => setIsKeyboardInSheet(!isKeyboardInSheet)}
                className={cn(
                  "w-9 h-9 rounded-full border border-white/5 flex items-center justify-center transition-all cursor-pointer shrink-0",
                  isKeyboardInSheet
                    ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border-[var(--accent-lime)]/30"
                    : "bg-white/[0.06] text-muted-foreground hover:text-white"
                )}
                title={isKeyboardInSheet ? "Switch to Orb" : "Type prompt"}
              >
                <Keyboard className="w-4 h-4" />
              </button>
            </div>

            {/* Drag-and-drop overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-20 rounded-[28px] bg-[var(--accent-lime)]/10 border-2 border-dashed border-[var(--accent-lime)]/50 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-[var(--accent-lime)] text-sm font-medium">
                  <UploadCloud className="w-5 h-5" />
                  <span>Drop files here</span>
                </div>
              </div>
            )}

            {/* Hidden file inputs (the capsule renders them itself, the dock surface is not mounted here) */}
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
        <ModelSwitcher className="mr-1" />
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

      {/* Transcript Area */}
      <ScrollArea
        viewportRef={transcriptRef}
        className={cn(
          "flex-1 min-h-0 px-4 sm:px-6",
          "[&_[data-slot=scroll-area-scrollbar]]:w-2 [&_[data-slot=scroll-area-scrollbar]]:p-0 [&_[data-slot=scroll-area-scrollbar]]:border-l-0",
          "[&_[data-slot=scroll-area-thumb]]:bg-[var(--border-subtle)] [&_[data-slot=scroll-area-thumb]:hover]:bg-[var(--border-hover)]",
          !isSide && "max-w-[720px] mx-auto"
        )}
      >
        <div className="w-full pt-3 pb-8">
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

        {/* Empty State: centered composer with idle orb */}
        {messages.length === 0 && (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3">
            <Orb state="idle" size="md" className="opacity-80 hover:opacity-100 transition-opacity" />
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
                  <div className="max-w-[75%] rounded-[20px] px-4 py-2.5 bg-white/[0.08] text-[#f1f3f9] text-base font-sans backdrop-blur-md leading-relaxed shadow-sm">
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
      </ScrollArea>

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

      {/* Composer: clean footer aligned with the transcript column */}
      <div
        className={cn(
          "shrink-0 px-4 sm:px-6 pt-4 pb-5 pointer-events-auto",
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

          <div className="flex items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask anything"
              className="flex-1 bg-transparent px-3.5 py-2 text-sm sm:text-base text-white placeholder-muted-foreground focus:outline-none resize-none font-sans max-h-36 leading-relaxed"
            />

            {/* Right Composer Controls */}
            <div className="flex items-center gap-1.5 pb-1 pr-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                title="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-white transition-colors cursor-pointer"
                title="Attach image"
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleVoice}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                title="Voice input"
              >
                <Orb state={orbState} size="sm" className="scale-75" />
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
