import { useEffect, useRef, useState, useCallback } from "react";
import { Compass, ZoomIn, ZoomOut, Sparkles, X, Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import { renderWorld, screenToWorld, worldToScreen } from "./renderer/mapPainter";
import { atlasStylePack } from "./styles/atlas";
import { auroraStylePack } from "./styles/aurora";
import type { CameraState, LayoutCity, MapLayout, Point2D, StylePack } from "./types";

interface WorldMapCanvasProps {
  layout: MapLayout;
  onEnterCity: (cityName: string, cityId: string) => void;
  onFoundCity?: (topic: string, position: Point2D) => void;
  buildingProgress?: Record<string, number>;
  className?: string;
}

export function WorldMapCanvas({
  layout,
  onEnterCity,
  onFoundCity,
  buildingProgress = {},
  className,
}: WorldMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Camera State
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1.0 });
  const [stylePack, setStylePack] = useState<StylePack>(atlasStylePack);
  const [hoveredCity, setHoveredCity] = useState<LayoutCity | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  // Found-a-city inline prompt state
  const [foundPrompt, setFoundPrompt] = useState<{
    screenPos: Point2D;
    worldPos: Point2D;
  } | null>(null);
  const [foundTopicInput, setFoundTopicInput] = useState("");

  // Gesture Tracking Refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraStartRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const lastPointerRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const animationFrameRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clamp helper for zoom levels
  const clampZoom = (z: number) => Math.min(Math.max(z, 0.4), 2.8);

  // Continuous 60fps render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const render = () => {
      const vw = canvas.width;
      const vh = canvas.height;
      if (vw > 0 && vh > 0) {
        renderWorld(ctx, layout, camera, stylePack, vw, vh, {
          hoveredCityId: hoveredCity?.id ?? null,
          selectedCityId,
          buildingProgress,
        });
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [layout, camera, stylePack, hoveredCity, selectedCityId, buildingProgress]);

  // Window Resize Listener with devicePixelRatio support
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Momentum Inertia Simulation
  const startInertia = useCallback(() => {
    const decay = 0.92;
    const minVelocity = 0.05;

    const step = () => {
      const { vx, vy } = velocityRef.current;
      if (Math.abs(vx) < minVelocity && Math.abs(vy) < minVelocity) {
        velocityRef.current = { vx: 0, vy: 0 };
        return;
      }

      setCamera((prev) => ({
        ...prev,
        x: prev.x - vx / prev.zoom,
        y: prev.y - vy / prev.zoom,
      }));

      velocityRef.current = {
        vx: vx * decay,
        vy: vy * decay,
      };

      animationFrameRef.current = requestAnimationFrame(step);
    };

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Smooth Fly-in to City
  const flyToCity = useCallback(
    (city: LayoutCity) => {
      setSelectedCityId(city.id);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      const startCamera = { ...camera };
      const targetCamera = {
        x: city.position.x,
        y: city.position.y,
        zoom: 2.2,
      };

      const duration = 650; // ms
      const startTime = performance.now();

      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const animateFly = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const t = easeOutCubic(progress);

        setCamera({
          x: startCamera.x + (targetCamera.x - startCamera.x) * t,
          y: startCamera.y + (targetCamera.y - startCamera.y) * t,
          zoom: startCamera.zoom + (targetCamera.zoom - startCamera.zoom) * t,
        });

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animateFly);
        } else {
          // Transition into City Workspace
          onEnterCity(city.title, city.id);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animateFly);
    },
    [camera, onEnterCity]
  );

  // Pointer Event Handlers (Pan & Hover)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 2) return;

    if (foundPrompt) setFoundPrompt(null);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    cameraStartRef.current = { ...camera };
    velocityRef.current = { vx: 0, vy: 0 };
    lastPointerRef.current = { x: e.clientX, y: e.clientY, time: performance.now() };

    // Long press detection for mobile found-a-city gesture
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const vw = rect.width;
        const vh = rect.height;
        const worldPos = screenToWorld(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          camera,
          vw,
          vh
        );
        setFoundPrompt({
          screenPos: { x: e.clientX - rect.left, y: e.clientY - rect.top },
          worldPos,
        });
      }
    }, 600);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (longPressTimerRef.current && (Math.abs(e.clientX - dragStartRef.current.x) > 6 || Math.abs(e.clientY - dragStartRef.current.y) > 6)) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const mouseScreen: Point2D = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const now = performance.now();
      const dt = Math.max(now - lastPointerRef.current.time, 1);

      velocityRef.current = {
        vx: (e.clientX - lastPointerRef.current.x) / (dt / 16.6),
        vy: (e.clientY - lastPointerRef.current.y) / (dt / 16.6),
      };

      lastPointerRef.current = { x: e.clientX, y: e.clientY, time: now };

      setCamera({
        ...camera,
        x: cameraStartRef.current.x - dx / cameraStartRef.current.zoom,
        y: cameraStartRef.current.y - dy / cameraStartRef.current.zoom,
      });
    } else {
      // Hit testing for city markers
      const hitThreshold = 26;
      let matchedCity: LayoutCity | null = null;

      for (const city of layout.cities) {
        const sPos = worldToScreen(city.position, camera, vw, vh);
        const dist = Math.hypot(sPos.x - mouseScreen.x, sPos.y - mouseScreen.y);
        if (dist <= hitThreshold) {
          matchedCity = city;
          break;
        }
      }

      setHoveredCity(matchedCity);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const dragDist = Math.hypot(
      e.clientX - dragStartRef.current.x,
      e.clientY - dragStartRef.current.y
    );

    if (dragDist < 6 && hoveredCity) {
      // Tap / Click on city
      flyToCity(hoveredCity);
    } else if (dragDist >= 6) {
      startInertia();
    }
  };

  // Wheel Zoom centered on cursor
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const mouseScreen: Point2D = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
    const newZoom = clampZoom(camera.zoom * zoomFactor);

    // Keep world coordinate under cursor invariant
    const worldBefore = screenToWorld(mouseScreen, camera, vw, vh);
    const newCamera = { ...camera, zoom: newZoom };
    const screenAfter = worldToScreen(worldBefore, newCamera, vw, vh);

    setCamera({
      x: newCamera.x + (screenAfter.x - mouseScreen.x) / newZoom,
      y: newCamera.y + (screenAfter.y - mouseScreen.y) / newZoom,
      zoom: newZoom,
    });
  };

  // Context Menu: Found-a-city gesture
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPos = screenToWorld(screenPos, camera, vw, vh);

    setFoundPrompt({ screenPos, worldPos });
    setFoundTopicInput("");
  };

  // Submit found a city
  const handleFoundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundTopicInput.trim() || !foundPrompt) return;
    if (onFoundCity) {
      onFoundCity(foundTopicInput.trim(), foundPrompt.worldPos);
    }
    setFoundPrompt(null);
  };

  // Semantic Zoom label
  const semanticLabel =
    camera.zoom < 0.9 ? "Regional Overview" : camera.zoom < 1.8 ? "City View" : "Neighborhood Detail";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full min-h-[500px] overflow-hidden select-none bg-[var(--bg-void,#050811)] cursor-grab active:cursor-grabbing",
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      role="region"
      aria-label="Interactive Procedural World Map"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Floating HUD Controls (Bottom-Right, quiet and minimal) */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-center gap-2 pointer-events-auto">
        <div className="flex flex-col bg-card/85 backdrop-blur-md border border-border/60 rounded-lg p-1 shadow-lg">
          <button
            type="button"
            className="p-2 hover:bg-accent/40 rounded text-foreground transition-colors"
            title="Zoom In"
            aria-label="Zoom In"
            onClick={() => setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom * 1.25) }))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-2 hover:bg-accent/40 rounded text-foreground transition-colors"
            title="Zoom Out"
            aria-label="Zoom Out"
            onClick={() => setCamera((c) => ({ ...c, zoom: clampZoom(c.zoom * 0.8) }))}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-2 hover:bg-accent/40 rounded text-foreground transition-colors"
            title="Reset Camera"
            aria-label="Reset Camera"
            onClick={() => setCamera({ x: 0, y: 0, zoom: 1.0 })}
          >
            <Compass className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="p-2 hover:bg-accent/40 rounded text-foreground transition-colors border-t border-border/40 mt-1 pt-2"
            title={`Cartography Style: ${stylePack.name}`}
            aria-label="Toggle Cartography Style"
            onClick={() =>
              setStylePack((s) => (s.id === "atlas" ? auroraStylePack : atlasStylePack))
            }
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>

        {/* Semantic Zoom Badge */}
        <span className="text-[10px] font-mono tracking-wider text-muted-foreground bg-background/70 px-2 py-0.5 rounded border border-border/40">
          {semanticLabel}
        </span>
      </div>

      {/* Interactive City Hover Tooltip */}
      {hoveredCity && containerRef.current && (
        (() => {
          const rect = containerRef.current.getBoundingClientRect();
          const sPos = worldToScreen(hoveredCity.position, camera, rect.width, rect.height);
          const region = layout.regions.find((r) => r.id === hoveredCity.regionId);

          return (
            <div
              className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
              style={{ left: sPos.x, top: sPos.y - 12 }}
            >
              <div className="bg-card/95 backdrop-blur-xl border border-border/80 text-card-foreground rounded-lg p-2.5 shadow-2xl min-w-[170px] text-center pointer-events-auto">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: region?.accentColor || "rgba(200, 255, 87, 0.2)",
                      color: region?.color || "#C8FF57",
                    }}
                  >
                    {region?.title || "Region"}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    LVL {hoveredCity.level}
                  </span>
                </div>
                <h4 className="font-display font-semibold text-sm text-foreground">
                  {hoveredCity.title}
                </h4>
                {hoveredCity.state === "building" ? (
                  <div className="mt-2 text-[11px] text-primary flex items-center justify-center gap-1">
                    <Sparkles className="h-3 w-3 animate-spin" />
                    <span>Constructing city...</span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                    <span>{hoveredCity.questCount ?? 3} Active Quests</span>
                    <span className="text-primary font-medium">· Enter →</span>
                  </p>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* "Found a City" Inline Gesture Popover */}
      {foundPrompt && (
        <div
          className="absolute z-40 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
          style={{ left: foundPrompt.screenPos.x, top: foundPrompt.screenPos.y }}
        >
          <form
            onSubmit={handleFoundSubmit}
            className="bg-card/95 backdrop-blur-xl border border-primary/50 text-card-foreground rounded-xl p-3 shadow-2xl flex flex-col gap-2 min-w-[260px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-primary flex items-center gap-1 font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                Found a City
              </span>
              <button
                type="button"
                onClick={() => setFoundPrompt(null)}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              What topic do you want to explore here?
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                autoFocus
                placeholder="e.g. Cognitive Science, Rust..."
                value={foundTopicInput}
                onChange={(e) => setFoundTopicInput(e.target.value)}
                className="flex-1 bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary font-sans"
              />
              <button
                type="submit"
                disabled={!foundTopicInput.trim()}
                className="bg-primary text-primary-foreground font-semibold px-2.5 py-1 rounded text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Build
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
