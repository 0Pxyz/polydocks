import { META_MODELS, REASONING_EFFORTS, getMetaModel, type ReasoningEffort } from "@/lib/agent/models";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModelSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function ModelSwitcher({ compact = false, className }: ModelSwitcherProps) {
  const { selectedModel, setSelectedModel, selectedEffort, setSelectedEffort, isStreaming } = useConversationStore();
  const currentModel = getMetaModel(selectedModel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isStreaming}
          className={cn(
            "h-7 gap-1.5 px-2 border-white/10 bg-white/5 hover:bg-white/10 text-white/90 hover:text-white transition-all text-xs font-mono select-none",
            isStreaming && "opacity-60 cursor-not-allowed",
            className
          )}
          title={`Active Meta Model: ${currentModel.name} (${currentModel.contextWindow})`}
        >
          <Sparkles className="w-3 h-3 text-[var(--color-primary,#C8FF57)]" />
          <span className="font-medium tracking-tight">
            {compact ? currentModel.shortName : currentModel.name}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-72 bg-[#0E0E12] border-white/10 text-white p-1.5 shadow-2xl backdrop-blur-md rounded-xl z-50"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          Meta Model API
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10 my-1" />

        <div className="space-y-1">
          {META_MODELS.map((model) => {
            const isSelected = model.id === currentModel.id;
            return (
              <DropdownMenuItem
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={cn(
                  "flex flex-col items-start gap-1 p-2 rounded-lg cursor-pointer transition-all",
                  isSelected
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-xs text-white">{model.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-muted-foreground">
                      {model.contextWindow}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[var(--color-primary,#C8FF57)] ml-auto" />
                  )}
                </div>

                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-[10px] font-mono text-[var(--color-primary,#C8FF57)]">
                    {model.badge}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {model.description}
                </p>
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator className="bg-white/10 my-1" />
        <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          Reasoning effort
        </DropdownMenuLabel>
        <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5">
          {REASONING_EFFORTS.map((effort) => {
            const isActive = effort === selectedEffort;
            const label = effort === "auto" ? "Auto" : effort === "xhigh" ? "XHigh" : effort.charAt(0).toUpperCase() + effort.slice(1);
            return (
              <button
                key={effort}
                type="button"
                disabled={isStreaming}
                onClick={() => setSelectedEffort(effort as ReasoningEffort)}
                title={effort === "auto" ? "Let the model choose reasoning depth" : `reasoning_effort="${effort}"`}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer",
                  isActive
                    ? "bg-[var(--color-primary,#C8FF57)]/15 text-[var(--color-primary,#C8FF57)] font-semibold"
                    : "text-white/60 hover:bg-white/5 hover:text-white",
                  isStreaming && "opacity-60 cursor-not-allowed"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
