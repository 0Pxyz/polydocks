import { useState, useRef, type ChangeEvent } from "react";
import {
  Palette,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Trash2,
  RotateCcw,
  Check,
} from "lucide-react";
import {
  THEMES,
  useThemeStore,
  type WallpaperFit,
} from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const PRESET_ACCENTS = [
  { label: "Lime", color: "#C8FF57" },
  { label: "Cyan", color: "#00E5FF" },
  { label: "Hot Pink", color: "#FF007F" },
  { label: "Matrix", color: "#00FF66" },
  { label: "Amber", color: "#F59E0B" },
  { label: "Violet", color: "#B388FF" },
  { label: "Crimson", color: "#FF3366" },
  { label: "Electric Blue", color: "#1D68FE" },
];

const PRESET_WALLPAPERS = [
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
    wallpaperFit,
    wallpaperOpacity,
    wallpaperBlur,
    setTheme,
    setCustomAccentColor,
    setWallpaper,
    setWallpaperFit,
    setWallpaperOpacity,
    setWallpaperBlur,
    clearWallpaper,
    resetTheme,
  } = useThemeStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [hexInput, setHexInput] = useState(customAccentColor ?? "");

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setWallpaper(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    setWallpaper(urlInput.trim());
    setUrlInput("");
  };

  const handleHexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hexInput)) {
      setCustomAccentColor(hexInput);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[var(--accent-lime)]" />
            <h1 className="text-xl font-bold tracking-tight text-foreground font-display">
              Workspace Appearance & Environment
            </h1>
            <Badge variant="outline" className="font-mono text-xs text-[var(--accent-lime)] border-[var(--accent-lime)]/40">
              Plugin #1
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Choose your core frequency, custom neon accent, or upload dynamic images and GIFs.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={resetTheme}
          className="self-start sm:self-auto gap-2 text-xs font-mono border-border/80 hover:bg-muted/40 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Defaults
        </Button>
      </div>

      {/* Section 1: Base Themes */}
      <div className="space-y-3">
        <label className="text-xs font-mono font-semibold tracking-wider text-muted-foreground uppercase">
          1. Base Theme Palettes
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {THEMES.map((item) => {
            const isSelected = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheme(item.id)}
                className={cn(
                  "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group relative overflow-hidden",
                  isSelected
                    ? "border-[var(--accent-lime)] bg-card shadow-[0_0_15px_rgba(200,255,87,0.12)]"
                    : "border-border/60 bg-card/60 hover:border-border hover:bg-card"
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: item.accentColor }}
                    />
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {item.name}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[var(--accent-lime)]" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Custom Neon Accent Color */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-semibold tracking-wider text-muted-foreground uppercase">
            2. Custom Neon Accent Color
          </label>
          {customAccentColor && (
            <button
              type="button"
              onClick={() => {
                setCustomAccentColor(null);
                setHexInput("");
              }}
              className="text-xs text-[var(--accent-lime)] hover:underline font-mono cursor-pointer"
            >
              Revert to theme preset
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {PRESET_ACCENTS.map((item) => {
            const isCurrent = (customAccentColor ?? "").toLowerCase() === item.color.toLowerCase();
            return (
              <button
                key={item.color}
                type="button"
                onClick={() => {
                  setCustomAccentColor(item.color);
                  setHexInput(item.color);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer",
                  isCurrent
                    ? "border-[var(--accent-lime)] bg-[var(--accent-lime)]/10 text-white"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Custom Hex Form */}
          <form onSubmit={handleHexSubmit} className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                #
              </span>
              <Input
                type="text"
                placeholder="C8FF57"
                value={hexInput.replace(/^#/, "")}
                onChange={(e) => setHexInput(`#${e.target.value.replace(/[^0-9a-fA-F]/g, "")}`)}
                className="w-28 pl-6 h-8 text-xs font-mono bg-card border-border/80"
                maxLength={6}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs font-mono cursor-pointer">
              Set Hex
            </Button>
          </form>
        </div>
      </div>

      {/* Section 3: Wallpaper & GIF Background Engine */}
      <div className="space-y-4 p-5 rounded-xl border border-border/80 bg-card/40 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[var(--accent-lime)]" />
            <span className="text-xs font-mono font-semibold tracking-wider text-foreground uppercase">
              3. Dynamic Wallpaper & GIF Engine
            </span>
          </div>
          {wallpaperUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearWallpaper}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs font-mono cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Remove Wallpaper
            </Button>
          )}
        </div>

        {/* Upload or URL Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/70 hover:border-[var(--accent-lime)]/70 rounded-xl bg-card/60 transition-colors cursor-pointer group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.gif,.webp"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Upload className="w-6 h-6 text-muted-foreground group-hover:text-[var(--accent-lime)] transition-colors mb-2" />
            <span className="text-xs font-semibold text-foreground">
              Upload Image or Animated GIF
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">
              PNG, JPG, WebP, animated GIF supported
            </span>
          </div>

          {/* Remote URL input & Presets */}
          <div className="flex flex-col justify-between space-y-3">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="Paste Image or GIF URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="h-9 text-xs font-mono bg-card border-border/80"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleApplyUrl}
                disabled={!urlInput.trim()}
                className="h-9 text-xs font-mono shrink-0 cursor-pointer"
              >
                Apply URL
              </Button>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-muted-foreground">
                Or choose a quick wallpaper:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_WALLPAPERS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setWallpaper(preset.url)}
                    className="px-2.5 py-1.5 text-xs text-left font-mono rounded border border-border/60 hover:border-[var(--accent-lime)]/60 bg-card/60 hover:bg-card truncate transition-colors cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Wallpaper Adjustments */}
        {wallpaperUrl && (
          <div className="pt-4 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Opacity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Opacity</span>
                <span>{Math.round(wallpaperOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.80"
                step="0.05"
                value={wallpaperOpacity}
                onChange={(e) => setWallpaperOpacity(parseFloat(e.target.value))}
                className="w-full accent-[var(--accent-lime)] cursor-pointer"
              />
            </div>

            {/* Blur */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Blur</span>
                <span>{wallpaperBlur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="16"
                step="1"
                value={wallpaperBlur}
                onChange={(e) => setWallpaperBlur(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--accent-lime)] cursor-pointer"
              />
            </div>

            {/* Fit Mode */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Fit Mode</span>
                <span className="capitalize">{wallpaperFit}</span>
              </div>
              <div className="flex rounded-md border border-border/80 overflow-hidden text-xs font-mono">
                {(["cover", "tile", "contain"] as WallpaperFit[]).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => setWallpaperFit(fit)}
                    className={cn(
                      "flex-1 py-1 text-center capitalize transition-colors cursor-pointer",
                      wallpaperFit === fit
                        ? "bg-[var(--accent-lime)] text-[#0a0a0c] font-bold"
                        : "hover:bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Agent Plugin Bridge Demonstration */}
      <div className="p-4 rounded-xl border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/[0.04] flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-[var(--accent-lime)] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-xs font-mono font-bold text-[var(--accent-lime)] uppercase tracking-wide">
            Autonomous Agent Plugin Active
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This theme system is exposed to the Meta AI dock agent via{" "}
            <code className="text-foreground font-mono bg-black/40 px-1 py-0.5 rounded text-[11px]">
              customize_theme
            </code>
            . You can ask in Terminal or Agent prompt:{" "}
            <em className="text-foreground">
              &quot;Switch to cyber theme, add a dark animated gif wallpaper, and tune accent to matrix green.&quot;
            </em>
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTheme("cyber");
                setCustomAccentColor("#00FF66");
                setWallpaper(
                  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
                  { opacity: 0.35, blur: 2 }
                );
              }}
              className="text-[11px] font-mono px-2.5 py-1 rounded bg-[var(--accent-lime)]/10 border border-[var(--accent-lime)]/40 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/20 transition-colors cursor-pointer"
            >
              Simulate: &quot;Agent: Activate Matrix Cyber Mode&quot;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
