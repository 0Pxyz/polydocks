import { useRef, useEffect, useState, useCallback } from "react";
import type { AsciiGrid, AsciiRegion } from "./types";

export interface AsciiWorldCanvasProps {
  grid: AsciiGrid;
  selectedRegionId?: string | null;
  onSelectRegion?: (region: AsciiRegion) => void;
  className?: string;
}

export function AsciiWorldCanvas({
  grid,
  selectedRegionId,
  onSelectRegion,
  className = "",
}: AsciiWorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan and Zoom Camera State
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1.0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hovered region
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

  // Font metrics (monospace)
  const CELL_WIDTH = 10;
  const CELL_HEIGHT = 16;
  const FONT_SIZE = 12;

  // Center camera on initial load or grid change
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const worldPixelWidth = grid.width * CELL_WIDTH;
    const worldPixelHeight = grid.height * CELL_HEIGHT;

    const initialZoom = Math.min(
      canvas.clientWidth / worldPixelWidth,
      canvas.clientHeight / worldPixelHeight,
      1.1
    ) * 0.95;

    const initialX = (canvas.clientWidth - worldPixelWidth * initialZoom) / 2;
    const initialY = (canvas.clientHeight - worldPixelHeight * initialZoom) / 2;

    setCamera({
      x: Math.round(initialX),
      y: Math.round(initialY),
      zoom: initialZoom > 0 ? initialZoom : 1.0,
    });
  }, [grid.seed, grid.width, grid.height]);

  // Main Render Loop onto Canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Support High-DPI Displays (Retina)
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark Background (tokens.css theme background: #0A0A0C)
    ctx.fillStyle = "#06080e";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Font Configuration
    ctx.font = `${FONT_SIZE}px "Geist Mono", "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";

    // Viewport Culling Bounds (Grid Coordinates)
    const startCol = Math.max(0, Math.floor(-camera.x / (CELL_WIDTH * camera.zoom)) - 1);
    const endCol = Math.min(
      grid.width - 1,
      Math.ceil((width - camera.x) / (CELL_WIDTH * camera.zoom)) + 1
    );
    const startRow = Math.max(0, Math.floor(-camera.y / (CELL_HEIGHT * camera.zoom)) - 1);
    const endRow = Math.min(
      grid.height - 1,
      Math.ceil((height - camera.y) / (CELL_HEIGHT * camera.zoom)) + 1
    );

    // 1. Draw Cells
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = grid.cells[r]?.[c];
        if (!cell || !cell.char || cell.char === " ") continue;

        const px = c * CELL_WIDTH;
        const py = r * CELL_HEIGHT;

        const isHovered = cell.regionId && cell.regionId === hoveredRegionId;
        const isSelected = cell.regionId && cell.regionId === selectedRegionId;

        // Background highlight if label or hovered/selected
        if (cell.backgroundColor) {
          ctx.fillStyle = isSelected
            ? "rgba(200, 255, 87, 0.22)" // accent lime
            : isHovered
            ? "rgba(56, 189, 248, 0.22)" // sky blue
            : cell.backgroundColor;
          ctx.fillRect(px, py, CELL_WIDTH, CELL_HEIGHT);
        } else if (isSelected) {
          ctx.fillStyle = "rgba(200, 255, 87, 0.08)";
          ctx.fillRect(px, py, CELL_WIDTH, CELL_HEIGHT);
        } else if (isHovered) {
          ctx.fillStyle = "rgba(56, 189, 248, 0.06)";
          ctx.fillRect(px, py, CELL_WIDTH, CELL_HEIGHT);
        }

        // Foreground character color
        ctx.fillStyle = isSelected
          ? "#C8FF57"
          : isHovered
          ? "#38bdf8"
          : cell.color;

        ctx.fillText(cell.char, px, py);
      }
    }

    // 2. Draw Subtle Region Focus Accents for Selected/Hovered Region
    const targetRegionId = selectedRegionId || hoveredRegionId;
    if (targetRegionId) {
      const center = grid.regionCenters.get(targetRegionId);
      if (center) {
        ctx.save();
        ctx.strokeStyle = selectedRegionId === targetRegionId ? "#C8FF57" : "#38bdf8";
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([4, 4]);

        const radius = 64;
        ctx.beginPath();
        ctx.arc(center.x * CELL_WIDTH, center.y * CELL_HEIGHT, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
    ctx.restore();
  }, [grid, camera, hoveredRegionId, selectedRegionId]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      render();
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [render]);

  // Handle Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const nextZoom = Math.max(0.4, Math.min(3.5, camera.zoom * zoomFactor));

    // Zoom centered around mouse pointer
    const nextX = mouseX - (mouseX - camera.x) * (nextZoom / camera.zoom);
    const nextY = mouseY - (mouseY - camera.y) * (nextZoom / camera.zoom);

    setCamera({
      x: nextX,
      y: nextY,
      zoom: nextZoom,
    });
  };

  // Convert Screen Pixel Coordinates to Grid Coordinates
  const screenToGrid = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const clientX = screenX - rect.left;
      const clientY = screenY - rect.top;

      const worldX = (clientX - camera.x) / camera.zoom;
      const worldY = (clientY - camera.y) / camera.zoom;

      const col = Math.floor(worldX / CELL_WIDTH);
      const row = Math.floor(worldY / CELL_HEIGHT);

      if (col >= 0 && col < grid.width && row >= 0 && row < grid.height) {
        return { col, row };
      }
      return null;
    },
    [camera, grid.width, grid.height]
  );

  // Pointer Down (Start Pan)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    cameraStartRef.current = { x: camera.x, y: camera.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Pointer Move (Pan & Hit-Test Hover)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setCamera({
        x: cameraStartRef.current.x + dx,
        y: cameraStartRef.current.y + dy,
        zoom: camera.zoom,
      });
      return;
    }

    // Hit-test under cursor
    const coords = screenToGrid(e.clientX, e.clientY);
    if (coords) {
      const cell = grid.cells[coords.row]?.[coords.col];
      if (cell?.regionId) {
        setHoveredRegionId(cell.regionId);
        return;
      }
    }
    setHoveredRegionId(null);
  };

  // Pointer Up (End Pan or Click Selection)
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const dist = Math.hypot(
      e.clientX - dragStartRef.current.x,
      e.clientY - dragStartRef.current.y
    );

    // If moved less than 5 pixels, consider it a Click Selection
    if (dist < 5) {
      const coords = screenToGrid(e.clientX, e.clientY);
      if (coords) {
        const cell = grid.cells[coords.row]?.[coords.col];
        if (cell?.regionId) {
          const regionInfo = grid.regionCenters.get(cell.regionId);
          if (regionInfo && onSelectRegion) {
            onSelectRegion(regionInfo.region);
          }
        }
      }
    }
  };

  return (
    <div className={`relative w-full h-full overflow-hidden select-none bg-[#06080e] ${className}`}>
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full touch-none block ${
          isDragging ? "cursor-grabbing" : hoveredRegionId ? "cursor-pointer" : "cursor-grab"
        }`}
      />

      {/* Floating Mini Compass / Reset Controls in Corner */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#0d121c]/80 border border-white/10 backdrop-blur-md shadow-xl text-xs font-mono text-zinc-400">
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const w = grid.width * CELL_WIDTH;
            const h = grid.height * CELL_HEIGHT;
            const z = Math.min(canvas.clientWidth / w, canvas.clientHeight / h) * 0.95;
            setCamera({
              x: (canvas.clientWidth - w * z) / 2,
              y: (canvas.clientHeight - h * z) / 2,
              zoom: z,
            });
          }}
          className="px-2 py-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          title="Reset Camera View"
        >
          Reset View
        </button>
        <span className="text-[10px] text-zinc-600 px-1">|</span>
        <span className="px-1.5 text-[11px] text-zinc-300">
          {Math.round(camera.zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
