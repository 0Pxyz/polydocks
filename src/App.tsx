import { useState, useEffect } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { WorldView } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { useThemeStore } from "@/lib/theme";

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("theme");
  const [selectedCity, setSelectedCity] = useState<string>("Neural Networks");

  const {
    wallpaperUrl,
    wallpaperFit,
    wallpaperOpacity,
    wallpaperBlur,
  } = useThemeStore();

  const handleDismissTool = (toolIdToDismiss?: string) => {
    const targetTool = toolIdToDismiss ?? activeToolId;
    setActiveToolId("");
    if (targetTool) {
      const dockBtn = document.querySelector<HTMLButtonElement>(
        `[data-dock-tool-id="${targetTool}"]`
      );
      dockBtn?.focus();
    }
  };

  useEffect(() => {
    if (activeToolId === "theme") {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleDismissTool("theme");
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [activeToolId]);

  return (
    <AppProviders>
      <RootLayout>
        <div className="relative min-h-screen w-full bg-background text-foreground overflow-x-hidden select-none">
          {/* Custom Wallpaper Layer (Image / GIF) */}
          {wallpaperUrl && (
            <div
              className="pointer-events-none fixed inset-0 z-0 transition-all duration-300"
              style={{
                backgroundImage: `url(${wallpaperUrl})`,
                backgroundSize:
                  wallpaperFit === "tile" ? "auto" : wallpaperFit,
                backgroundRepeat:
                  wallpaperFit === "tile" ? "repeat" : "no-repeat",
                backgroundPosition: "center",
                opacity: wallpaperOpacity,
                filter:
                  wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : undefined,
              }}
            />
          )}

          {/* Ambient lighting & subtle grid pattern */}
          <div
            className="pointer-events-none fixed inset-0 z-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 0%, rgba(200, 255, 87, 0.08) 0%, transparent 60%),
                linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 32px 32px, 32px 32px",
            }}
          />

          {/* Pinned Agentic Dock at the top edge of the screen */}
          <AgenticDock
            activeToolId={activeToolId}
            onSelectTool={(toolId) => setActiveToolId(toolId)}
          />

          {/* Main Active Workspace Content (rendered clear of the dock via DockSurface) */}
          <main className="relative z-10 min-h-screen w-full flex flex-col items-center">
            {activeToolId === "theme" && (
              <DockSurface frameless>
                <ThemeCustomizerView onDismiss={() => handleDismissTool("theme")} />
              </DockSurface>
            )}
            {activeToolId === "world" && (
              <DockSurface>
                <div className="w-full max-w-5xl">
                  <WorldView
                    onEnterCity={(cityName) => {
                      setSelectedCity(cityName);
                      setActiveToolId("city");
                    }}
                  />
                </div>
              </DockSurface>
            )}
            {activeToolId === "city" && (
              <DockSurface>
                <div className="w-full max-w-5xl">
                  <CityView
                    cityName={selectedCity}
                    onBackToWorld={() => setActiveToolId("world")}
                  />
                </div>
              </DockSurface>
            )}
            {activeToolId !== "theme" &&
              activeToolId !== "world" &&
              activeToolId !== "city" && (
                <DockSurface>
                  <div className="w-full max-w-2xl mx-auto py-16 text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-card border border-border/80 text-[var(--accent-lime)] shadow-[0_0_20px_rgba(200,255,87,0.15)] font-mono text-xl font-bold">
                      {activeToolId === "terminal" ? ">_" : "✦"}
                    </div>
                    <h2 className="text-xl font-bold font-display tracking-tight text-foreground capitalize">
                      {activeToolId} Experience Active
                    </h2>
                    <p className="text-sm text-muted-foreground font-sans max-w-md mx-auto">
                      The agent mounts this tool workspace on demand. You can customize the look and feel or switch tools directly from the dock.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveToolId("theme")}
                        className="px-4 py-2 rounded-lg text-xs font-mono border border-[var(--accent-lime)]/40 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/10 transition-colors cursor-pointer"
                      >
                        Open Theme & Wallpaper Customizer →
                      </button>
                    </div>
                  </div>
                </DockSurface>
              )}
          </main>
        </div>
      </RootLayout>
    </AppProviders>
  );
}
