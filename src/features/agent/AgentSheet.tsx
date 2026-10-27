import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Keyboard,
  Mic,
  MicOff,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Orb, type OrbState } from "./Orb";
import { streamAgentLoop } from "@/lib/agent/client";
import { type UIEvent, type ApprovalRequest } from "@/lib/agent/events";
import { startVoiceInput, speakReply, cancelSpeech, type VoiceRecognitionHandle } from "@/lib/agent/speech";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  timestamp: number;
}

interface AgentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cityId?: string;
  onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
  onOpenExperience?: (experienceId: string) => void;
  className?: string;
}

export function AgentSheet({
  isOpen,
  onClose,
  cityId,
  onExperienceCreated,
  onOpenExperience,
  className,
}: AgentSheetProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [inputText, setInputText] = useState<string>("");
  const [showTextInput, setShowTextInput] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [statusText, setStatusText] = useState<string>("Ask anything, or give a dock command…");
  const [activeApproval, setActiveApproval] = useState<ApprovalRequest | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const voiceHandleRef = useRef<VoiceRecognitionHandle | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript when expanded
  useEffect(() => {
    if (isExpanded) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isExpanded, statusText]);

  // Autofocus input when opened
  useEffect(() => {
    if (isOpen && showTextInput) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showTextInput]);

  // Stop any active speech or mic on sheet close
  useEffect(() => {
    if (!isOpen) {
      cancelSpeech();
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      if (orbState === "listening") setOrbState("idle");
    }
  }, [isOpen, orbState]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || orbState === "thinking") return;

    setInputText("");
    cancelSpeech();

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setOrbState("thinking");
    setStatusText("Thinking…");
    setActiveApproval(null);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const historyForBackend = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    await streamAgentLoop({
      prompt: text,
      cityId,
      history: historyForBackend,
      signal: abortCtrl.signal,
      onEvent: (event: UIEvent) => {
        handleUIEvent(event);
      },
    });
  };

  const handleUIEvent = (event: UIEvent) => {
    switch (event.type) {
      case "agent.started":
        setOrbState("thinking");
        break;

      case "tool.started":
        setOrbState("thinking");
        setStatusText(event.statusLabel);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "tool",
            toolName: event.name,
            content: event.statusLabel,
            timestamp: Date.now(),
          },
        ]);
        break;

      case "tool.completed":
        break;

      case "experience.created":
        onExperienceCreated?.(event.experience);
        setStatusText(`Mounted experience "${event.experience.title}" in the dock.`);
        break;

      case "dock.open_experience":
        setStatusText(`Opening experience "${event.experienceId}"…`);
        onOpenExperience?.(event.experienceId);
        // Quietly minimize back to dock so the user sees the newly opened experience
        setTimeout(() => {
          onClose();
        }, 600);
        break;

      case "approval.required":
        setOrbState("idle");
        setActiveApproval(event.approval);
        setStatusText(event.approval.message);
        break;

      case "agent.finished": {
        setOrbState("speaking");
        const replyText = event.text || "Done.";
        setStatusText(replyText);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: replyText,
            timestamp: Date.now(),
          },
        ]);

        if (soundEnabled) {
          speakReply(
            replyText,
            () => setOrbState("speaking"),
            () => setOrbState("idle")
          );
        } else {
          setOrbState("idle");
        }
        break;
      }

      case "agent.error":
        setOrbState("error");
        setStatusText(event.message);
        break;
    }
  };

  const handleAbortOrRetry = () => {
    if (orbState === "thinking") {
      abortControllerRef.current?.abort();
      setOrbState("idle");
      setStatusText("Canceled request.");
    } else if (orbState === "error") {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        handleSendMessage(lastUserMsg.content);
      } else {
        setOrbState("idle");
        setStatusText("Ask anything, or give a dock command…");
      }
    } else if (orbState === "listening") {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setOrbState("idle");
    } else {
      toggleVoiceInput();
    }
  };

  const toggleVoiceInput = () => {
    if (orbState === "listening") {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setOrbState("idle");
      return;
    }

    cancelSpeech();
    setOrbState("listening");
    setStatusText("Listening… Speak your prompt");

    const handle = startVoiceInput(
      (transcript, isFinal) => {
        setStatusText(transcript);
        if (isFinal) {
          handleSendMessage(transcript);
        }
      },
      (level) => setAudioLevel(level),
      () => {
        // Fallback silently to keyboard
        setOrbState("idle");
        setShowTextInput(true);
      },
      () => {
        setOrbState((curr) => (curr === "listening" ? "idle" : curr));
      }
    );

    if (handle) {
      voiceHandleRef.current = handle;
    } else {
      setOrbState("idle");
      setShowTextInput(true);
    }
  };

  const handleApprovalResponse = (approved: boolean) => {
    if (!activeApproval) return;
    const approval = activeApproval;
    setActiveApproval(null);

    if (approved) {
      handleSendMessage(`Confirmed: proceed with ${approval.toolName} for ${approval.experienceId}`);
    } else {
      setStatusText(`Canceled action for ${approval.experienceId}.`);
    }
  };

  if (!isOpen) return null;

  // -------------------------------------------------------------
  // Fullscreen Expanded View
  // -------------------------------------------------------------
  if (isExpanded) {
    return (
      <motion.div
        layoutId="agent-conversation-card"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[var(--bg-void)]/95 backdrop-blur-2xl p-6 sm:p-10 pointer-events-auto"
      >
        {/* Header Bar */}
        <div className="w-full max-w-3xl flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-2 text-sm font-mono text-[var(--accent-lime)]">
            <Sparkles className="w-4 h-4" />
            <span className="font-semibold tracking-wide">Polymax Dock Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              title={soundEnabled ? "Mute spoken replies" : "Unmute spoken replies"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              title="Minimize to sheet"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              title="Close to dock"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Central Orb in expanded view */}
        <div className="py-6 flex flex-col items-center gap-3">
          <Orb
            state={orbState}
            size="lg"
            audioLevel={audioLevel}
            onClick={handleAbortOrRetry}
          />
          <p className="text-xs font-mono text-muted-foreground text-center max-w-md">
            {orbState === "thinking"
              ? "Agent loop running • Tap orb to cancel"
              : orbState === "listening"
              ? "Listening to your voice…"
              : "Meta Muse Spark • Deterministic Tool Calling"}
          </p>
        </div>

        {/* Conversation Transcript */}
        <div className="w-full max-w-3xl flex-1 overflow-y-auto space-y-4 px-2 py-4">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground font-sans">
              Speak or ask anything to orchestrate research, build dynamic micro-apps, or customize your workspace.
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user" &&
                  "ml-auto bg-[var(--accent-lime)]/15 text-white border border-[var(--accent-lime)]/30 font-medium",
                msg.role === "assistant" &&
                  "mr-auto bg-[#141923] text-[#e2e8f0] border border-white/5 font-sans leading-relaxed shadow-lg",
                msg.role === "tool" &&
                  "mr-auto bg-black/40 text-muted-foreground text-xs font-mono border border-white/5 py-1.5 px-3"
              )}
            >
              {msg.role === "tool" && (
                <div className="flex items-center gap-1.5 text-[var(--accent-lime)]">
                  <span>✦</span>
                  <span>{msg.content}</span>
                </div>
              )}
              {msg.role !== "tool" && msg.content}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="w-full max-w-3xl pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center bg-[#10141d] border border-white/10 rounded-2xl p-1.5 shadow-2xl focus-within:border-[var(--accent-lime)]/50 transition-colors"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything, or give a dock command…"
              className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-muted-foreground focus:outline-none font-sans"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={cn(
                "p-2.5 rounded-xl transition-colors cursor-pointer mr-1",
                orbState === "listening"
                  ? "bg-red-500/20 text-red-400"
                  : "hover:bg-white/10 text-muted-foreground hover:text-white"
              )}
              title={orbState === "listening" ? "Stop listening" : "Voice input"}
            >
              {orbState === "listening" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="submit"
              disabled={!inputText.trim() || orbState === "thinking"}
              className="p-2.5 rounded-xl bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer font-bold"
              title="Send prompt"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  // -------------------------------------------------------------
  // Sheet View (Bottom Anchored Floating Capsule)
  // Matching /tmp/Maestri-drops/d5ba1c73-bbe6-4e85-8ea2-f6bdd2aaade6.png
  // -------------------------------------------------------------
  return (
    <AnimatePresence>
      <motion.div
        layoutId="agent-conversation-card"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 220, damping: 25 }}
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto",
          className
        )}
      >
        <div className="relative w-full rounded-[28px] bg-[#0c1017]/95 border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl p-5 overflow-hidden">
          {/* Top Left: Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer z-10"
            title="Close to dock"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Top Right: Expand Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer z-10"
            title="Expand to full screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Upper Text Area: Status / Streamed Response */}
          <div className="pt-2 px-10 pb-4 min-h-[58px] flex items-center justify-center text-center">
            {activeApproval ? (
              <div className="flex flex-col items-center gap-2.5">
                <p className="text-sm font-medium text-amber-300">
                  {activeApproval.message}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleApprovalResponse(true)}
                    className="px-3.5 py-1 rounded-lg text-xs font-mono font-bold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Allow Deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprovalResponse(false)}
                    className="px-3.5 py-1 rounded-lg text-xs font-mono bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                className={cn(
                  "text-sm line-clamp-3 transition-colors",
                  orbState === "error"
                    ? "text-red-400 font-medium"
                    : orbState === "thinking"
                    ? "text-[var(--accent-lime)] font-mono text-xs tracking-wide"
                    : "text-foreground font-sans"
                )}
              >
                {statusText}
              </p>
            )}
          </div>

          {/* Center Orb */}
          <div className="py-2 flex justify-center items-center">
            <Orb
              state={orbState}
              size="md"
              audioLevel={audioLevel}
              onClick={handleAbortOrRetry}
            />
          </div>

          {/* Text input row (collapsible or permanent) */}
          {showTextInput && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="mt-4 flex items-center bg-black/40 border border-white/10 rounded-2xl p-1.5 focus-within:border-[var(--accent-lime)]/50 transition-colors"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything, or give a dock command…"
                className="flex-1 bg-transparent px-3 py-1.5 text-sm text-white placeholder-muted-foreground focus:outline-none font-sans"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || orbState === "thinking"}
                className="p-1.5 rounded-xl bg-[var(--accent-lime)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer font-bold"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* Bottom Corners */}
          <div className="mt-3 flex items-center justify-between pt-1">
            {/* Bottom Left: Speaker Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "w-9 h-9 rounded-full border border-white/5 flex items-center justify-center transition-all cursor-pointer",
                soundEnabled
                  ? "bg-white/[0.06] text-muted-foreground hover:text-white"
                  : "bg-white/[0.02] text-muted-foreground/40"
              )}
              title={soundEnabled ? "Mute audio" : "Unmute audio"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Bottom Right: Keyboard / Mic Toggle */}
            <button
              type="button"
              onClick={() => {
                setShowTextInput(!showTextInput);
                if (!showTextInput) {
                  setTimeout(() => inputRef.current?.focus(), 100);
                }
              }}
              className={cn(
                "w-9 h-9 rounded-full border border-white/5 flex items-center justify-center transition-all cursor-pointer",
                showTextInput
                  ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border-[var(--accent-lime)]/30"
                  : "bg-white/[0.06] text-muted-foreground hover:text-white"
              )}
              title={showTextInput ? "Hide keyboard" : "Show keyboard"}
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
