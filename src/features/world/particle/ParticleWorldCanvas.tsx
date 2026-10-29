import { useRef, useEffect, useState, useCallback } from "react";
import type { ParticleWorld, TerritoryCluster, ParticleRegion } from "./types";
import { getCubicBezierPoint } from "./generator";
import { prefersReducedMotion } from "@/lib/motion";

export interface ParticleWorldCanvasProps {
  world: ParticleWorld;
  selectedRegionId?: string | null;
  onSelectRegion?: (region: ParticleRegion | null) => void;
  className?: string;
  onResetCameraReady?: (resetFn: () => void) => void;
  /** Restored camera (position preserved across navigation). */
  initialCamera?: { x: number; y: number; zoom: number } | null;
  /** Called when the user pans or zooms (for position persistence). */
  onCameraChange?: (camera: { x: number; y: number; zoom: number }) => void;
}

export function ParticleWorldCanvas({
  world,
  selectedRegionId,
  onSelectRegion,
  className = "",
  onResetCameraReady,
  initialCamera = null,
  onCameraChange,
}: ParticleWorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan and Zoom Camera State
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1.0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef<boolean>(false);

  // Hovered territory
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const hoveredRegionIdRef = useRef<string | null>(null);
  hoveredRegionIdRef.current = hoveredRegionId;

  const selectedRegionIdRef = useRef<string | null | undefined>(selectedRegionId);
  selectedRegionIdRef.current = selectedRegionId;

  // Animation & simulation state
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const isReducedMotion = prefersReducedMotion();
  const isVisibleRef = useRef<boolean>(true);

  // Reset/Center camera, keeping the world clear of the fixed Dock capsule.
  const centerCamera = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (initialCamera) {
      setCamera({ ...initialCamera });
      return;
    }

    const availableW = canvas.clientWidth || window.innerWidth;
    const availableH = canvas.clientHeight || window.innerHeight;

    // Dock offsets published by AgenticDock as CSS vars (px). Center the
    // world in the visible area instead of under the fixed capsule.
    const rootStyle = getComputedStyle(document.documentElement);
    const topOffset = parseFloat(rootStyle.getPropertyValue("--dock-top-offset")) || 0;
    const bottomOffset = parseFloat(rootStyle.getPropertyValue("--dock-bottom-offset")) || 0;

    const fitZoom = Math.min(
      availableW / world.width,
      availableH / world.height,
      1.15
    ) * 0.92;

    const initialZoom = Math.max(0.45, Math.min(fitZoom, 1.2));
    const initialX = (availableW - world.width * initialZoom) / 2;
    const initialY = (availableH - world.height * initialZoom + topOffset - bottomOffset) / 2;

    setCamera({
      x: Math.round(initialX),
      y: Math.round(initialY),
      zoom: initialZoom,
    });
  }, [world.width, world.height, initialCamera]);

  useEffect(() => {
    centerCamera();
    onResetCameraReady?.(centerCamera);
  }, [centerCamera, onResetCameraReady, world.seed]);

  // Main Canvas Render & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let isRunning = true;

    const loop = (currentTime: number) => {
      if (!isRunning) return;

      const dt = Math.min((currentTime - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = currentTime;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep Void Background
      ctx.fillStyle = "#06080e";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);

      const activeSelectedId = selectedRegionIdRef.current;
      const activeHoveredId = hoveredRegionIdRef.current;

      // 1. Draw Conduits (Inter-Region Splines)
      world.conduits.forEach((conduit) => {
        const isConnectedToActive =
          conduit.fromRegionId === activeSelectedId ||
          conduit.toRegionId === activeSelectedId ||
          conduit.fromRegionId === activeHoveredId ||
          conduit.toRegionId === activeHoveredId;

        ctx.beginPath();
        ctx.moveTo(conduit.from.x, conduit.from.y);
        ctx.bezierCurveTo(
          conduit.controlPoint1.x,
          conduit.controlPoint1.y,
          conduit.controlPoint2.x,
          conduit.controlPoint2.y,
          conduit.to.x,
          conduit.to.y
        );

        if (isConnectedToActive) {
          ctx.strokeStyle = "rgba(200, 255, 87, 0.4)";
          ctx.lineWidth = 1.8;
          ctx.stroke();
        } else {
          ctx.strokeStyle = conduit.color;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      });

      // 2. Draw Territory Boundaries (Dashed smoothed hulls)
      world.territories.forEach((t) => {
        const isSelected = t.id === activeSelectedId;
        const isHovered = t.id === activeHoveredId;

        if (t.boundaryPoints.length > 2) {
          ctx.beginPath();
          ctx.moveTo(t.boundaryPoints[0].x, t.boundaryPoints[0].y);
          for (let i = 1; i < t.boundaryPoints.length; i++) {
            ctx.lineTo(t.boundaryPoints[i].x, t.boundaryPoints[i].y);
          }
          ctx.closePath();

          if (isSelected) {
            ctx.strokeStyle = t.accentColor;
            ctx.fillStyle = "rgba(200, 255, 87, 0.04)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (isHovered) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
            ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
            ctx.lineWidth = 0.8;
            ctx.setLineDash([2, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      // 3. Update & Draw Particles
      const timeSec = currentTime * 0.001;

      // Group particles by fill color to batch canvas calls
      const batchMap = new Map<string, { x: number; y: number; r: number; alpha: number }[]>();

      world.allParticles.forEach((p) => {
        let drawX = p.baseX;
        let drawY = p.baseY;
        let drawAlpha = p.baseAlpha;
        let drawRadius = p.baseRadius;

        if (!isReducedMotion) {
          if (p.isPath && p.pathId) {
            // Conduit Flow Particle
            const conduit = world.conduits.find((c) => c.id === p.pathId);
            if (conduit) {
              const speed = p.pathSpeed ?? 0.0015;
              p.pathProgress = ((p.pathProgress ?? 0) + speed * dt * 60) % 1.0;
              const pt = getCubicBezierPoint(
                conduit.from,
                conduit.controlPoint1,
                conduit.controlPoint2,
                conduit.to,
                p.pathProgress
              );
              drawX = pt.x;
              drawY = pt.y;
              p.x = drawX;
              p.y = drawY;
            }
          } else if (p.orbitRadius && p.orbitSpeed) {
            // Orbital Satellite Mote
            p.orbitAngle = (p.orbitAngle ?? 0) + p.orbitSpeed * dt;
            drawX = p.baseX + Math.cos(p.orbitAngle) * p.orbitRadius;
            drawY = p.baseY + Math.sin(p.orbitAngle) * p.orbitRadius;
            p.x = drawX;
            p.y = drawY;
          } else {
            // Harmonic breathing motion
            const dy = Math.sin(timeSec * p.speed + p.phase) * 1.2;
            const dx = Math.cos(timeSec * p.speed + p.phase) * 0.8;
            drawX = p.baseX + dx;
            drawY = p.baseY + dy;
            p.x = drawX;
            p.y = drawY;
          }
        }

        // Selection / Hover Contrast Tuning
        if (p.regionId) {
          const isSelected = p.regionId === activeSelectedId;
          const isHovered = p.regionId === activeHoveredId;

          if (activeSelectedId) {
            if (isSelected) {
              drawAlpha = Math.min(1.0, p.baseAlpha * 1.25);
              drawRadius = p.baseRadius * 1.15;
            } else {
              drawAlpha = p.baseAlpha * 0.35;
            }
          } else if (isHovered) {
            drawAlpha = Math.min(1.0, p.baseAlpha * 1.2);
            drawRadius = p.baseRadius * 1.08;
          }
        }

        // Add to batch
        let list = batchMap.get(p.color);
        if (!list) {
          list = [];
          batchMap.set(p.color, list);
        }
        list.push({ x: drawX, y: drawY, r: drawRadius, alpha: drawAlpha });
      });

      // Render batched particles
      batchMap.forEach((particles, color) => {
        ctx.fillStyle = color;
        particles.forEach((pt) => {
          ctx.globalAlpha = pt.alpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1.0;

      // 4. Draw Landmarks & Typography
      world.territories.forEach((t) => {
        const isSelected = t.id === activeSelectedId;
        const isHovered = t.id === activeHoveredId;

        // Landmark Center Circle (restrained glow)
        ctx.beginPath();
        ctx.arc(t.center.x, t.center.y, isSelected ? 12 : 9, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? "rgba(200, 255, 87, 0.14)"
          : isHovered
          ? "rgba(255, 255, 255, 0.12)"
          : "rgba(0, 0, 0, 0.4)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? t.accentColor : "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = isSelected ? 1.8 : 1.0;
        ctx.stroke();

        // Landmark Symbol
        ctx.font = '11px "Geist Mono", "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isSelected ? "#06080e" : "#FFFFFF";

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(t.center.x, t.center.y, 6.5, 0, Math.PI * 2);
          ctx.fillStyle = t.accentColor;
          ctx.fill();
          ctx.fillStyle = "#06080e";
        }
        ctx.fillText(t.landmark, t.center.x, t.center.y);

        // Territory label: plain type with soft shadow (no boxes or tags).
        // Fades out at low zoom so labels never stack into noise.
        const labelY = t.center.y + (isSelected ? 20 : 18);
        const labelAlpha =
          isSelected || isHovered ? 1 : Math.max(0, Math.min(1, (camera.zoom - 0.55) / 0.3));
        if (labelAlpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = labelAlpha;
          ctx.font = `${
            isSelected ? "600 12px" : "11px"
          } "Geist Mono", "JetBrains Mono", ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = isSelected ? t.accentColor : isHovered ? "#FFFFFF" : "#C9CFD9";
          ctx.fillText(t.label, t.center.x, labelY + 1);
          ctx.restore();
        }
      });

      ctx.restore();
      ctx.restore();

      if (!isReducedMotion) {
        animFrameIdRef.current = requestAnimationFrame(loop);
      }
    };

    // Tab visibility + offscreen handling to save resources
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
      } else {
        lastTimeRef.current = performance.now();
        if (!animFrameIdRef.current && !isReducedMotion && isVisibleRef.current) {
          animFrameIdRef.current = requestAnimationFrame(loop);
        }
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
        if (!entry.isIntersecting && animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        } else if (entry.isIntersecting && !animFrameIdRef.current && !isReducedMotion && !document.hidden) {
          lastTimeRef.current = performance.now();
          animFrameIdRef.current = requestAnimationFrame(loop);
        }
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    lastTimeRef.current = performance.now();
    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      io.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [world, camera, isReducedMotion]);

  // Screen to World Coordinate Conversion
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom,
      };
    },
    [camera.x, camera.y, camera.zoom]
  );

  // Territory Hit-Testing
  const hitTestTerritory = useCallback(
    (screenX: number, screenY: number): TerritoryCluster | null => {
      const worldPt = screenToWorld(screenX, screenY);
      for (const t of world.territories.values()) {
        const dist = Math.hypot(worldPt.x - t.center.x, worldPt.y - t.center.y);
        if (dist <= t.radius * 1.1) {
          return t;
        }
      }
      return null;
    },
    [screenToWorld, world.territories]
  );

  // Mouse & Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    cameraStartRef.current = { x: camera.x, y: camera.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }
      setCamera((prev) => ({
        ...prev,
        x: Math.round(cameraStartRef.current.x + dx),
        y: Math.round(cameraStartRef.current.y + dy),
      }));
      return;
    }

    // Hover detection
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const hit = hitTestTerritory(mouseX, mouseY);
    setHoveredRegionId(hit ? hit.id : null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If click without drag, handle selection
    if (!hasMovedRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const hit = hitTestTerritory(mouseX, mouseY);

      if (hit) {
        onSelectRegion?.(hit.region);
      } else {
        onSelectRegion?.(null);
      }
    } else {
      onCameraChange?.(camera);
    }
  };

  // Wheel Zoom toward Mouse Cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
    const newZoom = Math.max(0.4, Math.min(3.2, camera.zoom * zoomFactor));

    // Keep point under cursor invariant
    const newX = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
    const newY = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);

    setCamera({
      x: Math.round(newX),
      y: Math.round(newY),
      zoom: newZoom,
    });
    onCameraChange?.({
      x: Math.round(newX),
      y: Math.round(newY),
      zoom: newZoom,
    });
  };

  // Touch Handlers for Mobile / Touchscreens
  const touchStartDistRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      hasMovedRef.current = false;
      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
      cameraStartRef.current = { x: camera.x, y: camera.y };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMovedRef.current = true;
      }
      setCamera((prev) => ({
        ...prev,
        x: Math.round(cameraStartRef.current.x + dx),
        y: Math.round(cameraStartRef.current.y + dy),
      }));
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = newDist / touchStartDistRef.current;
      touchStartDistRef.current = newDist;
      setCamera((prev) => ({
        ...prev,
        zoom: Math.max(0.4, Math.min(3.2, prev.zoom * ratio)),
      }));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging && !hasMovedRef.current && e.changedTouches.length === 1) {
      const canvas = canvasRef.current;
      if (canvas) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        const hit = hitTestTerritory(touchX, touchY);
        if (hit) {
          onSelectRegion?.(hit.region);
        } else {
          onSelectRegion?.(null);
        }
      }
    } else if (hasMovedRef.current) {
      onCameraChange?.(camera);
    }
    setIsDragging(false);
    touchStartDistRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`w-full h-full block cursor-grab active:cursor-grabbing select-none ${
        hoveredRegionId ? "cursor-pointer" : ""
      } ${className}`}
    />
  );
}
