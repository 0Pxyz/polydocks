import { META_MODELS, REASONING_EFFORTS, getMetaModel, type ReasoningEffort } from "@/lib/agent/models";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModelSwitcherProps {
  className?: string;
  align?: "start" | "end" | "center";
}

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  auto: "Auto",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

const EFFORT_DESCRIPTION: Record<ReasoningEffort, string> = {
  auto: "Model chooses reasoning depth",
  minimal: "Shortest reasoning pass",
  low: "Light reasoning, faster replies",
  medium: "Moderate depth",
  high: "Deep reasoning",
  xhigh: "Deeper reasoning",
  max: "Extended reasoning for the hardest problems",
};

export function ModelSwitcher({ className, align = "start" }: ModelSwitcherProps) {
  const { selectedModel, setSelectedModel, selectedEffort, setSelectedEffort, isStreaming } = useConversationStore();
  const currentModel = getMetaModel(selectedModel);

  const triggerLabel =
    selectedEffort === "auto"
      ? currentModel.shortName
      : `${currentModel.shortName} · ${EFFORT_LABEL[selectedEffort]}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isStreaming}
          className={cn(
            "h-7 gap-1 px-2 rounded-full text-xs font-sans text-muted-foreground hover:text-white hover:bg-white/10 transition-all select-none",
            isStreaming && "opacity-60 cursor-not-allowed",
            className
          )}
          title={
            selectedEffort === "auto"
              ? `Active Meta Model: ${currentModel.name} (${currentModel.contextWindow}) — Reasoning effort: Auto (parameter omitted)`
              : `Active Meta Model: ${currentModel.name} (${currentModel.contextWindow}) — reasoning_effort="${selectedEffort}"`
          }
        >
          <span className="font-medium tracking-tight truncate max-w-[160px]">{triggerLabel}</span>
          <ChevronUp className="w-3 h-3 opacity-70 shrink-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className="w-72 bg-[#0E0E12] border-white/10 text-white p-1.5 shadow-2xl backdrop-blur-md rounded-xl z-50"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          Meta Model API
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10 my-1" />

        <div className="space-y-0.5" role="radiogroup" aria-label="Model">
          {META_MODELS.map((model) => {
            const isSelected = model.id === currentModel.id;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedModel(model.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-left",
                  isSelected ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                )}
              >
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 text-[var(--color-primary,#C8FF57)] shrink-0" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-white truncate">{model.name}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{model.badge} · {model.contextWindow}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator className="bg-white/10 my-1" />
        <DropdownMenuLabel className="px-2 py-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          Reasoning effort
        </DropdownMenuLabel>

        <div className="space-y-0.5" role="radiogroup" aria-label="Reasoning effort">
          {REASONING_EFFORTS.map((effort) => {
            const isSelected = effort === selectedEffort;
            return (
              <button
                key={effort}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedEffort(effort)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-left",
                  isSelected ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                )}
              >
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 text-[var(--color-primary,#C8FF57)] shrink-0" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-white">{EFFORT_LABEL[effort]}</span>
                  <span className="block text-[11px] text-muted-foreground">{EFFORT_DESCRIPTION[effort]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
