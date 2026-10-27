import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { RotateCcw, Plus, Check, Ban, Upload } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { THEMES, useThemeStore } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { spring, prefersReducedMotion } from "@/lib/motion";
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

interface ThemeCustomizerViewProps {
  onDismiss?: () => void;
}

export function ThemeCustomizerView({ onDismiss }: ThemeCustomizerViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeRowRef = useRef<HTMLDivElement>(null);
  const accentRowRef = useRef<HTMLDivElement>(null);
  const wallpaperRowRef = useRef<HTMLDivElement>(null);

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

  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState(customAccentColor ?? "#00FF66");
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [isWallpaperPopoverOpen, setIsWallpaperPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const isReduced = prefersReducedMotion();

  // Outside click dismiss
  useEffect(() => {
    if (!onDismiss) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        const dockEl = document.querySelector("header");
        if (dockEl && dockEl.contains(e.target as Node)) {
          return;
        }
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onDismiss]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
    ref: React.RefObject<HTMLDivElement | null>
  ) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (index + 1) % total;
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
      btns?.[next]?.focus();
      btns?.[next]?.click();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (index - 1 + total) % total;
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
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

  // Active status line strings
  const currentThemeObj = THEMES.find((t) => t.id === theme);
  const currentAccentName = isCustomAccentActive
    ? `Custom (${customAccentColor})`
    : PRESET_ACCENTS.find(
        (p) =>
          p.color.toLowerCase() ===
          (customAccentColor ?? currentThemeObj?.accentColor)?.toLowerCase()
      )?.label ?? "Default";

  const currentWallpaperName = !wallpaperUrl
    ? null
    : PRESET_WALLPAPERS.find((p) => p.url === wallpaperUrl)?.name ?? "Custom";

  const defaultStatusLine = `${currentThemeObj?.name ?? "Theme"} • ${currentAccentName}${
    currentWallpaperName ? ` • ${currentWallpaperName}` : ""
  }`;

  const containerVariants: Variants = {
    initial: {
      opacity: 0,
      y: isReduced ? 0 : -8,
      scale: isReduced ? 1 : 0.98,
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        ...spring.soft,
        staggerChildren: isReduced ? 0 : 0.035, // 35ms unfold stagger
        delayChildren: 0.01,
      },
    },
    exit: {
      opacity: 0,
      y: isReduced ? 0 : -6,
      transition: { duration: 0.12 },
    },
  };

  const rowVariants: Variants = {
    initial: {
      opacity: 0,
      y: isReduced ? 0 : -6,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: spring.soft,
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.1 },
    },
  };

  return (
    <motion.div
      ref={containerRef}
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="relative flex flex-col items-center justify-center select-none pt-1"
    >
      {/* Soft radial scrim for legibility without any rectangle or sharp border */}
      <div
        className="pointer-events-none absolute -inset-x-24 -inset-y-12 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(10, 10, 12, 0.85) 0%, rgba(10, 10, 12, 0.45) 55%, transparent 85%)",
        }}
      />

      <div className="flex flex-col items-center gap-3 max-w-md w-full px-2">
        {/* Row 1: Base Theme Swatches + Reset */}
        <motion.div
          variants={rowVariants}
          ref={themeRowRef}
          role="radiogroup"
          aria-label="Base theme"
          className="flex items-center justify-center gap-2.5"
        >
          {THEMES.map((item, idx) => {
            const isSelected = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={item.name}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={(e) =>
                  handleRowKeyNavigation(e, idx, THEMES.length + 1, themeRowRef)
                }
                onClick={() => setTheme(item.id)}
                onMouseEnter={() => setHoveredLabel(item.name)}
                onMouseLeave={() => setHoveredLabel(null)}
                className={cn(
                  "relative w-8 h-8 rounded-full transition-all duration-150 cursor-pointer overflow-hidden border border-white/20 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-110 shadow-[0_0_12px_rgba(200,255,87,0.4)]"
                    : "opacity-80 hover:opacity-100 hover:scale-105"
                )}
                style={{ backgroundColor: item.bgColor }}
              >
                {/* Diagonal split accent preview */}
                <span
                  className="absolute inset-y-0 right-0 w-1/2 opacity-95"
                  style={{ backgroundColor: item.accentColor }}
                />
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                  </span>
                )}
              </button>
            );
          })}

          {/* Reset icon button aligned at the end of Row 1 */}
          <button
            type="button"
            onClick={resetTheme}
            aria-label="Reset appearance"
            onMouseEnter={() => setHoveredLabel("Reset to defaults")}
            onMouseLeave={() => setHoveredLabel(null)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/30 backdrop-blur-md bg-white/[0.03] hover:bg-white/[0.08] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </motion.div>

        {/* Row 2: Accent Color Dots */}
        <motion.div
          variants={rowVariants}
          ref={accentRowRef}
          role="radiogroup"
          aria-label="Accent color"
          className="flex items-center justify-center gap-2 sm:gap-2.5"
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
              <button
                key={item.color}
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
                onMouseEnter={() => setHoveredLabel(`Accent: ${item.label}`)}
                onMouseLeave={() => setHoveredLabel(null)}
                className={cn(
                  "w-6 h-6 rounded-full transition-all duration-150 cursor-pointer border border-white/25 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isCurrent
                    ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-115 shadow-[0_0_10px_rgba(200,255,87,0.5)]"
                    : "opacity-75 hover:opacity-100 hover:scale-110"
                )}
                style={{ backgroundColor: item.color }}
              />
            );
          })}

          {/* Custom color dot + popover */}
          <Popover
            open={isColorPopoverOpen}
            onOpenChange={setIsColorPopoverOpen}
          >
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
                onMouseEnter={() => setHoveredLabel("Custom Accent Color")}
                onMouseLeave={() => setHoveredLabel(null)}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer border backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isCustomAccentActive
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-115"
                    : "border-dashed border-white/40 opacity-75 hover:opacity-100 hover:scale-110 hover:border-white/70"
                )}
                style={{
                  background: isCustomAccentActive
                    ? customAccentColor ?? undefined
                    : "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 80%)",
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

            <PopoverContent
              side="bottom"
              align="center"
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
        </motion.div>

        {/* Row 3: Wallpaper Thumbnails */}
        <motion.div
          variants={rowVariants}
          ref={wallpaperRowRef}
          role="radiogroup"
          aria-label="Wallpaper"
          className="flex items-center justify-center gap-2.5"
        >
          {/* None Thumbnail */}
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
            onMouseEnter={() => setHoveredLabel("Wallpaper: None")}
            onMouseLeave={() => setHoveredLabel(null)}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer border backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              !wallpaperUrl
                ? "border-[var(--accent-lime)] ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.3)]"
                : "border-white/15 bg-card/40 text-muted-foreground opacity-70 hover:opacity-100 hover:border-white/30"
            )}
          >
            <Ban className="w-3.5 h-3.5" />
          </button>

          {/* 4 Preset Thumbnails */}
          {PRESET_WALLPAPERS.map((preset, idx) => {
            const isSelected = wallpaperUrl === preset.url;
            return (
              <button
                key={preset.name}
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
                onMouseEnter={() => setHoveredLabel(`Wallpaper: ${preset.name}`)}
                onMouseLeave={() => setHoveredLabel(null)}
                className={cn(
                  "w-8 h-8 rounded-lg transition-all duration-150 cursor-pointer overflow-hidden border bg-cover bg-center backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background shadow-[0_0_10px_rgba(200,255,87,0.35)]"
                    : "border-white/15 opacity-75 hover:opacity-100 hover:scale-105"
                )}
                style={{ backgroundImage: `url(${preset.url})` }}
              />
            );
          })}

          {/* Custom Upload / URL Tile */}
          <Popover
            open={isWallpaperPopoverOpen}
            onOpenChange={setIsWallpaperPopoverOpen}
          >
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
                onMouseEnter={() => setHoveredLabel("Upload Image or GIF")}
                onMouseLeave={() => setHoveredLabel(null)}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer border border-dashed backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  wallpaperUrl && !isPresetWallpaperActive
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.3)]"
                    : "border-white/30 bg-card/40 text-muted-foreground opacity-75 hover:opacity-100 hover:border-white/60 hover:scale-105"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              side="bottom"
              align="center"
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
        </motion.div>

        {/* Row 4: Conditional Wallpaper Controls (Opacity & Blur) */}
        <AnimatePresence>
          {wallpaperUrl && (
            <motion.div
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-xs space-y-2 pt-0.5"
            >
              {/* Opacity slider */}
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] font-mono text-muted-foreground w-12">
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
                <span className="text-[11px] font-mono text-muted-foreground w-12">
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

        {/* Row 5: Fixed Non-Overlapping Name Label Line */}
        <div className="h-5 flex items-center justify-center text-[11px] font-mono text-muted-foreground/90 tracking-wide text-center">
          {hoveredLabel ?? defaultStatusLine}
        </div>
      </div>
    </motion.div>
  );
}
