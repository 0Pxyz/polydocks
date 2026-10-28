import { useState, useRef, useEffect, useCallback } from "react";

export interface PanZoomState {
  x: number;
  y: number;
  zoom: number;
  isDragging: boolean;
}

export interface PanZoomOptions {
  imageWidth: number;
  imageHeight: number;
  minZoom?: number;
  maxZoom?: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPanZoomChange?: (state: { x: number; y: number; zoom: number }) => void;
}

/**
 * useMapPanZoom:
 * Pointer-event pan & zoom hook with momentum inertia, wheel/pinch zoom,
 * clamped to image boundaries, min-zoom fit, and 4x max-zoom.
 * Pure native pointer events with zero third-party dependencies.
 */
export function useMapPanZoom({
  imageWidth,
  imageHeight,
  minZoom: userMinZoom,
  maxZoom = 4.0,
  containerRef,
  onPanZoomChange,
}: PanZoomOptions) {
  const [state, setState] = useState<PanZoomState>({
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const dragStartRef = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const velocityRef = useRef<{ vx: number; vy: number; lastTime: number }>({ vx: 0, vy: 0, lastTime: 0 });
  const animFrameRef = useRef<number | null>(null);

  // Compute fit-to-screen minZoom based on container dimensions
  const getMinZoom = useCallback(() => {
    if (userMinZoom) return userMinZoom;
    const container = containerRef.current;
    if (!container || imageWidth <= 0 || imageHeight <= 0) return 0.5;
    const scaleX = container.clientWidth / imageWidth;
    const scaleY = container.clientHeight / imageHeight;
    return Math.max(scaleX, scaleY); // Cover container
  }, [containerRef, imageWidth, imageHeight, userMinZoom]);

  // Clamp translation so image stays within view
  const clampState = useCallback(
    (x: number, y: number, zoom: number) => {
      const container = containerRef.current;
      const minZ = getMinZoom();
      const clampedZoom = Math.min(Math.max(zoom, minZ), maxZoom);

      if (!container) return { x, y, zoom: clampedZoom };

      const cW = container.clientWidth;
      const cH = container.clientHeight;
      const curW = imageWidth * clampedZoom;
      const curH = imageHeight * clampedZoom;

      const minX = Math.min(0, cW - curW);
      const maxX = Math.max(0, (cW - curW) / 2);
      const minY = Math.min(0, cH - curH);
      const maxY = Math.max(0, (cH - curH) / 2);

      const clampedX = Math.min(Math.max(x, minX), maxX);
      const clampedY = Math.min(Math.max(y, minY), maxY);

      return { x: clampedX, y: clampedY, zoom: clampedZoom };
    },
    [containerRef, getMinZoom, imageHeight, imageWidth, maxZoom]
  );

  // Reset to initial centered fit
  const resetFit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const minZ = getMinZoom();
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const initX = (cW - imageWidth * minZ) / 2;
    const initY = (cH - imageHeight * minZ) / 2;
    const next = { x: initX, y: initY, zoom: minZ, isDragging: false };
    setState(next);
    onPanZoomChange?.({ x: next.x, y: next.y, zoom: next.zoom });
  }, [containerRef, getMinZoom, imageHeight, imageWidth, onPanZoomChange]);

  useEffect(() => {
    resetFit();
  }, [resetFit]);

  // Pointer Down (start drag)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return; // Primary click only
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    dragStartRef.current = {
      x: stateRef.current.x,
      y: stateRef.current.y,
      pointerX: e.clientX,
      pointerY: e.clientY,
    };

    velocityRef.current = { vx: 0, vy: 0, lastTime: performance.now() };
    setState((s) => ({ ...s, isDragging: true }));
  }, []);

  // Pointer Move (pan with velocity tracking)
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;

      const now = performance.now();
      const dt = Math.max(1, now - velocityRef.current.lastTime);
      const dx = e.clientX - start.pointerX;
      const dy = e.clientY - start.pointerY;

      velocityRef.current = {
        vx: (e.clientX - (start.pointerX + (stateRef.current.x - start.x))) / dt,
        vy: (e.clientY - (start.pointerY + (stateRef.current.y - start.y))) / dt,
        lastTime: now,
      };

      const rawX = start.x + dx;
      const rawY = start.y + dy;
      const clamped = clampState(rawX, rawY, stateRef.current.zoom);

      setState((s) => ({ ...s, x: clamped.x, y: clamped.y }));
      onPanZoomChange?.({ x: clamped.x, y: clamped.y, zoom: clamped.zoom });
    },
    [clampState, onPanZoomChange]
  );

  // Pointer Up (inertia glide)
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      dragStartRef.current = null;
      setState((s) => ({ ...s, isDragging: false }));

      try {
        const target = e.currentTarget as HTMLElement;
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Safe release
      }

      // Smooth inertia
      let vx = velocityRef.current.vx * 15;
      let vy = velocityRef.current.vy * 15;

      const stepInertia = () => {
        if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) return;
        vx *= 0.92;
        vy *= 0.92;

        const nextRawX = stateRef.current.x + vx;
        const nextRawY = stateRef.current.y + vy;
        const clamped = clampState(nextRawX, nextRawY, stateRef.current.zoom);

        setState((s) => ({ ...s, x: clamped.x, y: clamped.y }));
        onPanZoomChange?.({ x: clamped.x, y: clamped.y, zoom: clamped.zoom });
        animFrameRef.current = requestAnimationFrame(stepInertia);
      };

      animFrameRef.current = requestAnimationFrame(stepInertia);
    },
    [clampState, onPanZoomChange]
  );

  // Wheel zoom (centered around pointer)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const nextZoom = stateRef.current.zoom * zoomFactor;

      // Maintain focal point
      const nextX = pointerX - (pointerX - stateRef.current.x) * (nextZoom / stateRef.current.zoom);
      const nextY = pointerY - (pointerY - stateRef.current.y) * (nextZoom / stateRef.current.zoom);

      const clamped = clampState(nextX, nextY, nextZoom);
      setState((s) => ({ ...s, x: clamped.x, y: clamped.y, zoom: clamped.zoom }));
      onPanZoomChange?.({ x: clamped.x, y: clamped.y, zoom: clamped.zoom });
    },
    [clampState, containerRef, onPanZoomChange]
  );

  // Keyboard navigation (+, -, arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const nextZoom = stateRef.current.zoom * 1.25;
        const clamped = clampState(stateRef.current.x, stateRef.current.y, nextZoom);
        setState((s) => ({ ...s, zoom: clamped.zoom }));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const nextZoom = stateRef.current.zoom * 0.8;
        const clamped = clampState(stateRef.current.x, stateRef.current.y, nextZoom);
        setState((s) => ({ ...s, zoom: clamped.zoom }));
      } else if (e.key === "0") {
        resetFit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clampState, resetFit]);

  // Convert normalized [0, 1] map coordinates to viewport client pixel coordinates
  const mapToViewport = useCallback(
    (nx: number, ny: number) => {
      const px = nx * imageWidth * state.zoom + state.x;
      const py = ny * imageHeight * state.zoom + state.y;
      return { x: px, y: py };
    },
    [imageWidth, imageHeight, state.zoom, state.x, state.y]
  );

  // Convert viewport client pixel coordinates to normalized [0, 1] map coordinates
  const viewportToMap = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { nx: 0.5, ny: 0.5 };
      const rect = container.getBoundingClientRect();
      const vx = clientX - rect.left - state.x;
      const vy = clientY - rect.top - state.y;
      const nx = Math.min(Math.max(vx / (imageWidth * state.zoom), 0), 1);
      const ny = Math.min(Math.max(vy / (imageHeight * state.zoom), 0), 1);
      return { nx, ny };
    },
    [containerRef, imageWidth, imageHeight, state.zoom, state.x, state.y]
  );

  return {
    ...state,
    resetFit,
    mapToViewport,
    viewportToMap,
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onWheel: handleWheel,
    },
  };
}
