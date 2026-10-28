import { useState, useEffect } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock, type DockToolItem } from "@/features/dock/AgenticDock";
import { DockSurface } from "@/features/dock/DockSurface";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { WorldView } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { AgentConversation } from "@/features/agent/AgentConversation";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useThemeStore } from "@/lib/theme";
import { useNavigationStore } from "@/lib/store/useNavigationStore";
import { useDockStore } from "@/lib/store/useDockStore";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export default function App() {
  const [activeToolId, setActiveToolId] = useState<string>("");
  const [extraTools, setExtraTools] = useState<DockToolItem[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("Neural Networks");

  const { viewMode, activeCityId, enterCity, exitToWorld } = useNavigationStore();
  const { setActiveTool: setDockActiveTool } = useDockStore();

  const {
    layoutState,
    sideWidth,
    isStreaming,
    setLayoutState,
    toggleAgent,
  } = useConversationStore();

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

  const handleSelectTool = (toolId: string) => {
    if (toolId === "agent") {
      toggleAgent(activeToolId);
      return;
    }

    if (toolId === "world") {
      exitToWorld();
      setActiveToolId("");
      setDockActiveTool("");
      return;
    }

    if (toolId === "city") {
      enterCity(selectedCity);
      setActiveToolId("");
      setDockActiveTool("");
      return;
    }

    const isWide = typeof window !== "undefined" && window.innerWidth >= 900;

    // If chat is full and a tool is clicked, split to side
    if (layoutState === "full") {
      if (isWide) {
        setLayoutState("side");
        setActiveToolId(toolId);
        setDockActiveTool(toolId);
      } else {
        setLayoutState("sheet");
        setActiveToolId(toolId);
        setDockActiveTool(toolId);
      }
      return;
    }

    // If chat is in side mode and same tool is re-clicked, close tool and chat goes to full
    if (layoutState === "side" && activeToolId === toolId) {
      setActiveToolId("");
      setDockActiveTool("");
      setLayoutState("full");
      return;
    }

    // Toggle tool selection normally
    const nextTool = activeToolId === toolId ? "" : toolId;
    setActiveToolId(nextTool);
    setDockActiveTool(nextTool);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (layoutState === "full") {
          setLayoutState("sheet");
        } else if (layoutState === "sheet") {
          setLayoutState("closed");
        } else if (layoutState === "side") {
          if (activeToolId) {
            setActiveToolId("");
            setLayoutState("full");
          } else {
            setLayoutState("closed");
          }
        } else if (activeToolId === "theme") {
          handleDismissTool("theme");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutState, activeToolId, setLayoutState]);

  const isSideLayout = layoutState === "side";

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
            isAgentSheetOpen={layoutState !== "closed"}
            isAgentWorking={isStreaming}
            extraTools={extraTools}
            onSelectTool={handleSelectTool}
          />

          {/* Single Agent Conversation Instance (Never unmounted; survives layout transitions) */}
          <AgentConversation
            cityId={selectedCity}
            onExperienceCreated={(exp) => {
              setExtraTools((prev) => {
                if (prev.some((t) => t.id === exp.id)) return prev;
                return [
                  ...prev,
                  {
                    id: exp.id,
                    label: exp.title,
                    type: "icon",
                    icon: Sparkles,
                  },
                ];
              });
            }}
            onOpenExperience={(expId) => {
              setActiveToolId(expId);
            }}
          />

          {/* Main Active Workspace Content (rendered side-by-side or full width) */}
          <main
            style={isSideLayout ? { marginLeft: `${sideWidth}px` } : undefined}
            className={cn(
              "relative z-10 min-h-screen w-full flex flex-col items-center transition-[margin] duration-150",
              isSideLayout && "w-[calc(100%-${sideWidth}px)] max-w-full"
            )}
          >
            {activeToolId === "theme" ? (
              <DockSurface frameless>
                <ThemeCustomizerView onDismiss={() => handleDismissTool("theme")} />
              </DockSurface>
            ) : viewMode === "city" || activeToolId === "city" ? (
              <DockSurface>
                <div className="w-full max-w-5xl">
                  <CityView
                    cityName={activeCityId || selectedCity}
                    activeToolId={activeToolId === "city" ? "overview" : activeToolId}
                    onSelectTool={handleSelectTool}
                    onBackToWorld={() => {
                      exitToWorld();
                      setActiveToolId("");
                      setDockActiveTool("");
                    }}
                  />
                </div>
              </DockSurface>
            ) : (
              /* Living World/Map View is the base canvas (always visible behind sheet or as default view) */
              <DockSurface>
                <div className="w-full max-w-5xl">
                  <WorldView
                    onEnterCity={(cityName) => {
                      setSelectedCity(cityName);
                      enterCity(cityName);
                      setActiveToolId("");
                      setDockActiveTool("");
                    }}
                  />
                </div>
              </DockSurface>
            )}
          </main>
        </div>
      </RootLayout>
    </AppProviders>
  );
}
