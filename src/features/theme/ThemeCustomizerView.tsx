import { useState, useRef, type KeyboardEvent, type ChangeEvent } from "react";
import { RotateCcw, Plus, Check, Ban, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { THEMES, useThemeStore } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
import { slideUp } from "@/lib/motion";
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
    wallpaperUrl,
    wallpaperOpacity,
    wallpaperBlur,
    setTheme,
    setCustomAccentColor,
    setWallpaper,
    setWallpaperOpacity,
    setWallpaperBlur,
    clearWallpaper,
    resetTheme,
  } = useThemeStore();

  const [isDragging, setIsDragging] = useState(false);
  const [customHex, setCustomHex] = useState(customAccentColor ?? "#00FF66");
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [isWallpaperPopoverOpen, setIsWallpaperPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeRowRef = useRef<HTMLDivElement>(null);
  const accentRowRef = useRef<HTMLDivElement>(null);
  const wallpaperRowRef = useRef<HTMLDivElement>(null);

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

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setWallpaper(reader.result, { fit: "cover" });
        setIsWallpaperPopoverOpen(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setWallpaper(urlInput.trim(), { fit: "cover" });
    setUrlInput("");
    setIsWallpaperPopoverOpen(false);
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

  const isPresetWallpaperActive = PRESET_WALLPAPERS.some(
    (p) => p.url === wallpaperUrl
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
          "w-full max-w-sm sm:max-w-md mx-auto p-5 rounded-2xl bg-card/65 backdrop-blur-xl border border-border/80 shadow-2xl transition-all duration-200 space-y-4",
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
          <Popover
            open={isColorPopoverOpen}
            onOpenChange={setIsColorPopoverOpen}
          >
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
              className="w-44 p-2.5 bg-card/95 backdrop-blur-xl border-border/80 shadow-xl space-y-2"
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

        {/* 3. Wallpaper Thumbnails Row */}
        <div
          ref={wallpaperRowRef}
          role="radiogroup"
          aria-label="Wallpaper"
          className="flex items-center justify-between gap-1.5 px-1 pt-1 border-t border-border/30"
        >
          {/* None Thumbnail */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={!wallpaperUrl}
                aria-label="None"
                tabIndex={!wallpaperUrl ? 0 : -1}
                onKeyDown={(e) =>
                  handleRowKeyNavigation(
                    e,
                    0,
                    PRESET_WALLPAPERS.length + 2,
                    wallpaperRowRef
                  )
                }
                onClick={clearWallpaper}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  !wallpaperUrl
                    ? "border-[var(--accent-lime)] ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.25)]"
                    : "border-border/70 bg-card/40 text-muted-foreground opacity-70 hover:opacity-100 hover:border-border"
                )}
              >
                <Ban className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[11px] font-sans">
              None
            </TooltipContent>
          </Tooltip>

          {/* 4 Preset Thumbnails */}
          {PRESET_WALLPAPERS.map((preset, idx) => {
            const isSelected = wallpaperUrl === preset.url;
            return (
              <Tooltip key={preset.name}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={preset.name}
                    tabIndex={isSelected ? 0 : -1}
                    onKeyDown={(e) =>
                      handleRowKeyNavigation(
                        e,
                        idx + 1,
                        PRESET_WALLPAPERS.length + 2,
                        wallpaperRowRef
                      )
                    }
                    onClick={() => setWallpaper(preset.url, { fit: "cover" })}
                    className={cn(
                      "w-10 h-10 rounded-lg transition-all duration-150 cursor-pointer overflow-hidden border bg-cover bg-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isSelected
                        ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background shadow-[0_0_10px_rgba(200,255,87,0.3)]"
                        : "border-border/60 opacity-75 hover:opacity-100 hover:border-border"
                    )}
                    style={{ backgroundImage: `url(${preset.url})` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] font-sans">
                  {preset.name}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Custom Upload / URL Tile */}
          <Popover
            open={isWallpaperPopoverOpen}
            onOpenChange={setIsWallpaperPopoverOpen}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Upload custom wallpaper"
                    aria-pressed={Boolean(wallpaperUrl && !isPresetWallpaperActive)}
                    tabIndex={wallpaperUrl && !isPresetWallpaperActive ? 0 : -1}
                    onKeyDown={(e) =>
                      handleRowKeyNavigation(
                        e,
                        PRESET_WALLPAPERS.length + 1,
                        PRESET_WALLPAPERS.length + 2,
                        wallpaperRowRef
                      )
                    }
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer border border-dashed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      wallpaperUrl && !isPresetWallpaperActive
                        ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.25)]"
                        : "border-border/80 bg-card/40 text-muted-foreground opacity-75 hover:opacity-100 hover:border-white/50"
                    )}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px] font-sans">
                Upload or URL
              </TooltipContent>
            </Tooltip>

            <PopoverContent
              side="bottom"
              align="end"
              className="w-56 p-3 bg-card/95 backdrop-blur-xl border-border/80 shadow-xl space-y-2.5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.gif,.webp"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-xs font-sans gap-2 h-8 border-border/80 hover:bg-muted/40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Image or GIF
              </Button>
              <div className="flex gap-1.5 pt-0.5">
                <Input
                  type="url"
                  placeholder="Paste URL..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyUrl();
                  }}
                  className="h-7 text-xs bg-background/60"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleApplyUrl}
                  disabled={!urlInput.trim()}
                  className="h-7 text-xs px-2.5 cursor-pointer"
                >
                  Load
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 4. Conditional Wallpaper Controls (Opacity & Blur) */}
        <AnimatePresence>
          {wallpaperUrl && (
            <motion.div
              variants={slideUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-3 pt-3 border-t border-border/40"
            >
              {/* Opacity slider */}
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] font-sans text-muted-foreground w-12">
                  Opacity
                </span>
                <Slider
                  value={[Math.round(wallpaperOpacity * 100)]}
                  min={5}
                  max={80}
                  step={5}
                  onValueChange={(vals) => setWallpaperOpacity(vals[0] / 100)}
                  className="flex-1 cursor-pointer"
                />
              </div>

              {/* Blur slider */}
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] font-sans text-muted-foreground w-12">
                  Blur
                </span>
                <Slider
                  value={[wallpaperBlur]}
                  min={0}
                  max={16}
                  step={1}
                  onValueChange={(vals) => setWallpaperBlur(vals[0])}
                  className="flex-1 cursor-pointer"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
