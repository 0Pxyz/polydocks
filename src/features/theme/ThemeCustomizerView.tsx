import { useState, useRef, type KeyboardEvent } from "react";
import { RotateCcw, Plus, Check } from "lucide-react";
import { THEMES, useThemeStore } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export const PRESET_ACCENTS = [
  { label: "Lime", color: "#C8FF57" },
  { label: "Cyan", color: "#00E5FF" },
  { label: "Hot Pink", color: "#FF007F" },
  { label: "Matrix", color: "#00FF66" },
  { label: "Amber", color: "#F59E0B" },
  { label: "Violet", color: "#B388FF" },
  { label: "Crimson", color: "#FF3366" },
  { label: "Electric Blue", color: "#1D68FE" },
];

export const PRESET_WALLPAPERS = [
  {
    name: "Cyber Grid",
    url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1600&q=80",
  },
  {
    name: "Deep Space",
    url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80",
  },
  {
    name: "Abstract Neon",
    url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=80",
  },
  {
    name: "Dark Matrix",
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
  },
];

export function ThemeCustomizerView() {
  const {
    theme,
    customAccentColor,
    setTheme,
    setCustomAccentColor,
    setWallpaper,
    resetTheme,
  } = useThemeStore();

  const [isDragging, setIsDragging] = useState(false);
  const [customHex, setCustomHex] = useState(customAccentColor ?? "#00FF66");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const themeRowRef = useRef<HTMLDivElement>(null);
  const accentRowRef = useRef<HTMLDivElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith("image/") || file.name.endsWith(".gif"))) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setWallpaper(reader.result, { fit: "cover" });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRowKeyNavigation = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
    total: number,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (index + 1) % total;
      const btns = containerRef.current?.querySelectorAll<HTMLButtonElement>("button");
      btns?.[next]?.focus();
      btns?.[next]?.click();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (index - 1 + total) % total;
      const btns = containerRef.current?.querySelectorAll<HTMLButtonElement>("button");
      btns?.[prev]?.focus();
      btns?.[prev]?.click();
    }
  };

  const handleCustomColorChange = (hex: string) => {
    setCustomHex(hex);
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      setCustomAccentColor(hex);
    }
  };

  const isCustomAccentActive = Boolean(
    customAccentColor &&
      !PRESET_ACCENTS.some(
        (p) => p.color.toLowerCase() === customAccentColor.toLowerCase()
      )
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "w-full max-w-sm sm:max-w-md mx-auto p-5 rounded-2xl bg-card/65 backdrop-blur-xl border border-border/80 shadow-2xl transition-all duration-200 space-y-5",
          isDragging && "border-[var(--accent-lime)] ring-2 ring-[var(--accent-lime)]/40"
        )}
      >
        {/* Title row */}
        <div className="flex items-center justify-between pb-1 border-b border-border/40">
          <h1 className="text-sm font-semibold tracking-wide text-foreground font-display">
            Appearance
          </h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetTheme}
                aria-label="Reset appearance to defaults"
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-[11px] font-sans">
              Reset
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 1. Base Theme Swatches Row */}
        <div
          ref={themeRowRef}
          role="radiogroup"
          aria-label="Base theme"
          className="flex items-center justify-between gap-2 px-1"
        >
          {THEMES.map((item, idx) => {
            const isSelected = theme === item.id;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={item.name}
                    tabIndex={isSelected ? 0 : -1}
                    onKeyDown={(e) =>
                      handleRowKeyNavigation(e, idx, THEMES.length, themeRowRef)
                    }
                    onClick={() => setTheme(item.id)}
                    className={cn(
                      "group relative w-10 h-10 rounded-full transition-all duration-200 cursor-pointer overflow-hidden border border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isSelected
                        ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-105 shadow-[0_0_12px_rgba(200,255,87,0.3)]"
                        : "opacity-80 hover:opacity-100 hover:scale-105"
                    )}
                    style={{ backgroundColor: item.bgColor }}
                  >
                    {/* Ringed / split accent preview */}
                    <span
                      className="absolute inset-y-0 right-0 w-1/2 opacity-95 transition-opacity"
                      style={{ backgroundColor: item.accentColor }}
                    />
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-sans">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* 2. Accent Color Dots Row */}
        <div
          ref={accentRowRef}
          role="radiogroup"
          aria-label="Accent color"
          className="flex items-center justify-between gap-1.5 px-1"
        >
          {PRESET_ACCENTS.map((item, idx) => {
            const isCurrent =
              !isCustomAccentActive &&
              ((customAccentColor ?? "").toLowerCase() ===
                item.color.toLowerCase() ||
                (!customAccentColor &&
                  THEMES.find((t) => t.id === theme)?.accentColor.toLowerCase() ===
                    item.color.toLowerCase()));

            return (
              <Tooltip key={item.color}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isCurrent}
                    aria-label={item.label}
                    tabIndex={isCurrent ? 0 : -1}
                    onKeyDown={(e) =>
                      handleRowKeyNavigation(
                        e,
                        idx,
                        PRESET_ACCENTS.length + 1,
                        accentRowRef
                      )
                    }
                    onClick={() => setCustomAccentColor(item.color)}
                    className={cn(
                      "w-6 h-6 rounded-full transition-all duration-150 cursor-pointer border border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isCurrent
                        ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-110 shadow-[0_0_8px_rgba(200,255,87,0.4)]"
                        : "opacity-75 hover:opacity-100 hover:scale-105"
                    )}
                    style={{ backgroundColor: item.color }}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-sans">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Custom color dot + popover */}
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Custom accent color"
                    aria-pressed={isCustomAccentActive}
                    tabIndex={isCustomAccentActive ? 0 : -1}
                    onKeyDown={(e) =>
                      handleRowKeyNavigation(
                        e,
                        PRESET_ACCENTS.length,
                        PRESET_ACCENTS.length + 1,
                        accentRowRef
                      )
                    }
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isCustomAccentActive
                        ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-110"
                        : "border-dashed border-white/40 opacity-75 hover:opacity-100 hover:scale-105 hover:border-white/70"
                    )}
                    style={{
                      background: isCustomAccentActive
                        ? customAccentColor ?? undefined
                        : "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 80%)",
                    }}
                  >
                    <Plus
                      className={cn(
                        "w-3 h-3",
                        isCustomAccentActive ? "text-black" : "text-muted-foreground"
                      )}
                    />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px] font-sans">
                Custom Color
              </TooltipContent>
            </Tooltip>

            <PopoverContent
              side="bottom"
              align="end"
              className="w-48 p-3 bg-card/95 backdrop-blur-xl border-border/80 shadow-xl space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customHex.startsWith("#") ? customHex : `#${customHex}`}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent"
                />
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                    #
                  </span>
                  <Input
                    type="text"
                    value={customHex.replace(/^#/, "")}
                    onChange={(e) =>
                      handleCustomColorChange(
                        `#${e.target.value.replace(/[^0-9a-fA-F]/g, "")}`
                      )
                    }
                    maxLength={6}
                    className="h-7 pl-5 text-xs font-mono bg-background/60"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </TooltipProvider>
  );
}
