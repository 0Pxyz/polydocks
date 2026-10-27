import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  THEMES,
  useThemeStore,
} from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setWallpaper(reader.result, { fit: "cover" });
        }
      };
      reader.readAsDataURL(file);
    }
  };

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

        {/* Base Theme Row */}
        <div
          role="radiogroup"
          aria-label="Base theme"
          className="flex items-center justify-between gap-2 px-1"
        >
          {THEMES.map((item) => {
            const isSelected = theme === item.id;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={item.name}
                    onClick={() => setTheme(item.id)}
                    className={cn(
                      "relative w-9 h-9 rounded-full transition-all duration-200 cursor-pointer overflow-hidden border border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isSelected
                        ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-105"
                        : "opacity-80 hover:opacity-100 hover:scale-105"
                    )}
                    style={{ backgroundColor: item.bgColor }}
                  >
                    {/* Diagonal accent split preview */}
                    <span
                      className="absolute inset-y-0 right-0 w-1/2 opacity-90"
                      style={{ backgroundColor: item.accentColor }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-sans">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Accent Color Row */}
        <div
          role="radiogroup"
          aria-label="Accent color"
          className="flex items-center justify-between gap-1.5 px-1"
        >
          {PRESET_ACCENTS.map((item) => {
            const isCurrent =
              (customAccentColor ?? "").toLowerCase() === item.color.toLowerCase() ||
              (!customAccentColor &&
                THEMES.find((t) => t.id === theme)?.accentColor.toLowerCase() ===
                  item.color.toLowerCase());

            return (
              <Tooltip key={item.color}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isCurrent}
                    aria-label={item.label}
                    onClick={() => setCustomAccentColor(item.color)}
                    className={cn(
                      "w-6 h-6 rounded-full transition-all duration-150 cursor-pointer border border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isCurrent
                        ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-110"
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
        </div>
      </div>
    </TooltipProvider>
  );
}
