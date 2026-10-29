import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { RotateCcw, Plus, Check, Ban, Upload, Clipboard, Download } from "lucide-react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { THEMES, useThemeStore } from "@/lib/theme";
import { DOCK_STYLES, type DockStyleId } from "@/features/dock/styles";
import { useOnboardingStore } from "@/lib/store/useOnboardingStore";
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
import {
  promptInstall,
  subscribeInstallStatus,
  type PwaInstallStatus,
} from "@/lib/platform/pwa";

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
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    theme,
    customAccentColor,
    wallpaperUrl,
    wallpaperOpacity,
    wallpaperBlur,
    dockStyle,
    dockPosition,
    setTheme,
    setCustomAccentColor,
    setWallpaper,
    setWallpaperOpacity,
    setWallpaperBlur,
    setDockStyle,
    setDockPosition,
    clearWallpaper,
    resetTheme,
  } = useThemeStore();

  const [activeLabel, setActiveLabel] = useState<string | null>(() => {
    return THEMES.find((t) => t.id === theme)?.name ?? "Void Lime";
  });
  const [customHex, setCustomHex] = useState(customAccentColor ?? "#00FF66");
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [isWallpaperPopoverOpen, setIsWallpaperPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const [installStatus, setInstallStatus] = useState<PwaInstallStatus>("unavailable");
  useEffect(() => subscribeInstallStatus(setInstallStatus), []);
  const isReduced = prefersReducedMotion();

  // Show transient name label that fades out after 1.2s of inactivity
  const showTransientLabel = (text: string) => {
    setActiveLabel(text);
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
    }
    fadeTimeoutRef.current = setTimeout(() => {
      setActiveLabel(null);
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, []);

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

  const processImageFile = (file: File) => {
    if (file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|svg|bmp)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setWallpaper(reader.result, { fit: "cover" });
          setIsWallpaperPopoverOpen(false);
          showTransientLabel(file.name ? `Wallpaper: ${file.name}` : "Custom Wallpaper");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    // Reset file input so selecting the same file again triggers change event
    e.target.value = "";
  };

  // Window-wide drag and drop listener from local filesystem
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processImageFile(files[0]);
      }
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  // Global paste handler for images, GIFs, and URLs (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

      // 1. Check for image files in clipboard
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/") || file.name.endsWith(".gif")) {
          e.preventDefault();
          processImageFile(file);
          return;
        }
      }

      // 2. Check for image items (e.g. copied from web page or screenshot)
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith("image/")) {
            const blob = item.getAsFile();
            if (blob) {
              e.preventDefault();
              processImageFile(blob);
              return;
            }
          }
        }
      }

      // 3. Check for image URL text (if not inside an input)
      if (!isInputFocused) {
        const text = e.clipboardData?.getData("text")?.trim();
        if (
          text &&
          (text.startsWith("http://") ||
            text.startsWith("https://") ||
            text.startsWith("data:image/") ||
            /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(text))
        ) {
          e.preventDefault();
          setWallpaper(text, { fit: "cover" });
          setIsWallpaperPopoverOpen(false);
          showTransientLabel("Pasted Wallpaper URL");
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            processImageFile(file);
            return;
          }
        }
      }

      if (navigator.clipboard?.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text) {
          setWallpaper(text, { fit: "cover" });
          setIsWallpaperPopoverOpen(false);
          showTransientLabel("Pasted Wallpaper");
        }
      }
    } catch {
      // Clipboard read permission declined or not supported
    }
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setWallpaper(urlInput.trim(), { fit: "cover" });
    setUrlInput("");
    setIsWallpaperPopoverOpen(false);
    showTransientLabel("Remote Wallpaper");
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
      showTransientLabel(`Custom (${hex.toUpperCase()})`);
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
        staggerChildren: isReduced ? 0 : 0.035,
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
      onDrop={(e) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          processImageFile(files[0]);
        }
      }}
      className="relative flex flex-col items-center justify-center select-none"
    >
      {/* Permanent file input in DOM (never unmounted by Popover focus/blur) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.gif,.webp"
        onChange={handleFileUpload}
        className="hidden"
      />
      {/* Soft radial scrim fading completely within ~120px without visible edges */}
      <div
        className="pointer-events-none absolute -inset-x-24 -inset-y-16 -z-10 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 260px 180px at 50% 45%, rgba(10, 10, 12, 0.92) 0%, rgba(10, 10, 12, 0.5) 60%, transparent 100%)",
        }}
      />

      {/* One aligned column: exactly 336px wide with 24px vertical rhythm */}
      <div className="flex flex-col items-center space-y-6 w-[calc(100vw-32px)] sm:w-[336px] max-w-[336px] mx-auto px-1">
        {/* Row 1: Base Theme Swatches (40px) + Reset (40px) */}
        <motion.div
          variants={rowVariants}
          ref={themeRowRef}
          role="radiogroup"
          aria-label="Base theme"
          className="w-full flex items-center justify-between"
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
                onClick={() => {
                  setTheme(item.id);
                  showTransientLabel(item.name);
                }}
                onMouseEnter={() => showTransientLabel(item.name)}
                className={cn(
                  "relative w-10 h-10 rounded-full transition-all duration-150 cursor-pointer overflow-hidden border border-white/20 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-110 shadow-[0_0_12px_rgba(200,255,87,0.4)]"
                    : "opacity-80 hover:opacity-100 hover:scale-105"
                )}
                style={{ backgroundColor: item.bgColor }}
              >
                <span
                  className="absolute inset-y-0 right-0 w-1/2 opacity-95"
                  style={{ backgroundColor: item.accentColor }}
                />
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              resetTheme();
              showTransientLabel("Reset");
            }}
            aria-label="Reset appearance"
            onMouseEnter={() => showTransientLabel("Reset")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-white/15 hover:border-white/35 backdrop-blur-md bg-white/[0.04] hover:bg-white/[0.09] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Row 2: Accent Color Dots (28px each, spanning full column width) */}
        <motion.div
          variants={rowVariants}
          ref={accentRowRef}
          role="radiogroup"
          aria-label="Accent color"
          className="w-full flex items-center justify-between"
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
                onClick={() => {
                  setCustomAccentColor(item.color);
                  showTransientLabel(item.label);
                }}
                onMouseEnter={() => showTransientLabel(item.label)}
                className={cn(
                  "w-7 h-7 rounded-full transition-all duration-150 cursor-pointer border border-white/25 backdrop-blur-md shadow-[0_2px_6px_rgba(0,0,0,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isCurrent
                    ? "ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-115 shadow-[0_0_10px_rgba(200,255,87,0.5)]"
                    : "opacity-75 hover:opacity-100 hover:scale-110"
                )}
                style={{ backgroundColor: item.color }}
              />
            );
          })}

          {/* Custom color dot (28px) */}
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
                onMouseEnter={() => showTransientLabel("Custom Color")}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer border backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isCustomAccentActive
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background scale-115"
                    : "border-dashed border-white/40 opacity-75 hover:opacity-100 hover:scale-110 hover:border-white/70"
                )}
                style={{
                  background: isCustomAccentActive
                    ? customAccentColor ?? undefined
                    : "radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 80%)",
                }}
              >
                <Plus
                  className={cn(
                    "w-3.5 h-3.5",
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

        {/* Row 3: Wallpaper Thumbnails (50px each, 12px radius) */}
        <motion.div
          variants={rowVariants}
          ref={wallpaperRowRef}
          role="radiogroup"
          aria-label="Wallpaper"
          className="w-full flex items-center justify-between"
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
            onClick={() => {
              clearWallpaper();
              showTransientLabel("None");
            }}
            onMouseEnter={() => showTransientLabel("None")}
            className={cn(
              "w-[50px] h-[50px] rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              !wallpaperUrl
                ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_12px_rgba(200,255,87,0.35)]"
                : "border-dashed border-white/20 bg-card/40 text-muted-foreground opacity-70 hover:opacity-100 hover:border-white/40"
            )}
          >
            <Ban className="w-4 h-4" />
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
                onClick={() => {
                  setWallpaper(preset.url, { fit: "cover" });
                  showTransientLabel(preset.name);
                }}
                onMouseEnter={() => showTransientLabel(preset.name)}
                className={cn(
                  "w-[50px] h-[50px] rounded-xl transition-all duration-150 cursor-pointer overflow-hidden border bg-cover bg-center backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(200,255,87,0.4)]"
                    : "border-white/15 opacity-80 hover:opacity-100 hover:scale-105"
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
                onMouseEnter={() => showTransientLabel("Upload or URL")}
                className={cn(
                  "w-[50px] h-[50px] rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer border border-dashed backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  wallpaperUrl && !isPresetWallpaperActive
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background bg-card text-[var(--accent-lime)] shadow-[0_0_12px_rgba(200,255,87,0.35)]"
                    : "border-white/30 bg-card/40 text-muted-foreground opacity-75 hover:opacity-100 hover:border-white/60 hover:scale-105"
                )}
              >
                <Plus className="w-4 h-4" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              side="bottom"
              align="center"
              className="w-60 p-3 bg-card/95 backdrop-blur-xl border-border/80 shadow-2xl space-y-2.5"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-xs font-sans gap-2 h-8 border-border/80 hover:bg-muted/40 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Image or GIF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePasteFromClipboard}
                className="w-full text-xs font-sans gap-2 h-8 border-border/80 hover:bg-muted/40 cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Paste Image or URL
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
                  className="h-7 text-xs px-2.5 cursor-pointer font-bold"
                >
                  Load
                </Button>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground/75 text-center pt-0.5">
                Press Ctrl+V anywhere or Drag & Drop
              </p>
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
              className="w-full space-y-3 pt-1"
            >
              {/* Opacity slider with 56px fixed left label */}
              <div className="flex items-center gap-3 w-full">
                <span className="w-14 shrink-0 text-left text-xs font-mono text-muted-foreground">
                  Opacity
                </span>
                <Slider
                  value={[Math.round(wallpaperOpacity * 100)]}
                  min={5}
                  max={80}
                  step={5}
                  onValueChange={(vals) => {
                    setWallpaperOpacity(vals[0] / 100);
                    showTransientLabel(`Opacity ${vals[0]}%`);
                  }}
                  className="flex-1 cursor-pointer"
                />
              </div>

              {/* Blur slider with 56px fixed left label */}
              <div className="flex items-center gap-3 w-full">
                <span className="w-14 shrink-0 text-left text-xs font-mono text-muted-foreground">
                  Blur
                </span>
                <Slider
                  value={[wallpaperBlur]}
                  min={0}
                  max={16}
                  step={1}
                  onValueChange={(vals) => {
                    setWallpaperBlur(vals[0]);
                    showTransientLabel(`Blur ${vals[0]}px`);
                  }}
                  className="flex-1 cursor-pointer"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dock Style Swatches (Glass, Solid, Bare, Lift) */}
        <motion.div
          variants={rowVariants}
          role="radiogroup"
          aria-label="Dock style"
          className="w-full flex items-center justify-between gap-1.5"
        >
          {(Object.keys(DOCK_STYLES) as DockStyleId[]).map((styleId) => {
            const isSelected = dockStyle === styleId;
            const styleMeta = DOCK_STYLES[styleId];
            return (
              <button
                key={styleId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Dock style: ${styleMeta.name}`}
                onClick={() => {
                  setDockStyle(styleId);
                  showTransientLabel(`Dock: ${styleMeta.name}`);
                }}
                onMouseEnter={() => showTransientLabel(`Dock: ${styleMeta.name}`)}
                className={cn(
                  "flex-1 h-[32px] rounded-xl flex items-center justify-center gap-1 transition-all duration-150 cursor-pointer overflow-hidden border backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)]",
                  isSelected
                    ? "border-transparent ring-2 ring-[var(--accent-lime)] ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(200,255,87,0.35)]"
                    : "border-white/15 opacity-75 hover:opacity-100 hover:scale-105",
                  styleId === "glass" && "bg-[#0c0e14]/80",
                  styleId === "solid" && "bg-[#0c0e14]",
                  styleId === "bare" && "bg-transparent border-dashed border-white/20",
                  styleId === "lift" && "bg-[#0c0e14]/80"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-lime)]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </button>
            );
          })}
        </motion.div>

        {/* Dock Position Segmented Toggle (Top / Bottom) */}
        <motion.div
          variants={rowVariants}
          className="w-full flex items-center justify-between"
        >
          <span className="text-xs font-mono text-muted-foreground">Dock Position</span>
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/[0.04]">
            <button
              type="button"
              onClick={() => {
                setDockPosition("top");
                showTransientLabel("Dock: Top");
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-sans transition-colors cursor-pointer",
                dockPosition === "top"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[#9aa5b8] hover:text-white"
              )}
            >
              Top
            </button>
            <button
              type="button"
              onClick={() => {
                setDockPosition("bottom");
                showTransientLabel("Dock: Bottom");
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-sans transition-colors cursor-pointer",
                dockPosition === "bottom"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[#9aa5b8] hover:text-white"
              )}
            >
              Bottom
            </button>
          </div>
        </motion.div>

        {/* Product Walkthrough Replay */}
        <motion.div
          variants={rowVariants}
          className="w-full flex items-center justify-between pt-1"
        >
          <span className="text-xs font-mono text-muted-foreground">Walkthrough</span>
          <button
            type="button"
            onClick={() => {
              useOnboardingStore.getState().openOnboarding();
              onDismiss?.();
            }}
            className="text-xs text-[#9aa5b8] hover:text-white transition-colors cursor-pointer px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08]"
          >
            Replay
          </button>
        </motion.div>

        {/* Row: App Install (only when the browser offers installation) */}
        <AnimatePresence>
          {(installStatus === "prompt-ready" || installStatus === "ios-hint") && (
            <motion.div
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              {installStatus === "prompt-ready" ? (
                <button
                  type="button"
                  onClick={() => {
                    void promptInstall().then((outcome) => {
                      if (outcome) {
                        showTransientLabel(outcome === "accepted" ? "Installing" : "Dismissed");
                      }
                    });
                  }}
                  onMouseEnter={() => showTransientLabel("Install app")}
                  className="w-full h-9 flex items-center justify-center gap-2 rounded-full bg-white/[0.05] hover:bg-white/[0.09] text-[13px] font-sans font-medium text-foreground/85 hover:text-foreground backdrop-blur-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-lime)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Download className="w-4 h-4" />
                  <span>Install app</span>
                </button>
              ) : (
                <p className="text-center text-[13px] font-sans text-foreground/80">
                  In Safari, open the Share menu and choose Add to Home Screen.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 5: Fixed Non-Overlapping Transient Name Label (13px, sans, fades after 1.2s) */}
        <div className="h-6 flex items-center justify-center text-[13px] font-sans font-medium text-foreground/80 tracking-normal text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] transition-opacity duration-300">
          <span
            className={cn(
              "transition-opacity duration-300",
              activeLabel ? "opacity-100" : "opacity-0"
            )}
          >
            {activeLabel ?? ""}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
