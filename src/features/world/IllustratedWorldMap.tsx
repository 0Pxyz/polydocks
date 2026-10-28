import React, { useRef, useState, useEffect } from "react";
import { useMapPanZoom } from "./useMapPanZoom";
import type { MapSource, CityPoint } from "./types";
import { cn } from "@/lib/cn";

export interface IllustratedWorldMapProps {
  mapSource: MapSource;
  cityPoints?: CityPoint[];
  selectedCityId?: string;
  onSelectCity?: (cityId: string) => void;
  onFoundCity?: (coords: { x: number; y: number }, topic: string) => void;
  className?: string;
  renderOverlay?: (coords: {
    mapToViewport: (nx: number, ny: number) => { x: number; y: number };
    zoom: number;
  }) => React.ReactNode;
}

/**
 * IllustratedWorldMap (Maps v2):
 * Full-screen hardware-accelerated illustrated map surface with smooth pointer pan/zoom,
 * progressive blur-up image hydration, soft contrast vignette, and accent overlay.
 */
export function IllustratedWorldMap({
  mapSource,
  className,
  renderOverlay,
}: IllustratedWorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(false);

  // When mapSource changes, reset image loading state
  useEffect(() => {
    setIsFullImageLoaded(false);
  }, [mapSource.id, mapSource.image.url]);

  const {
    x,
    y,
    zoom,
    isDragging,
    mapToViewport,
    bind,
  } = useMapPanZoom({
    imageWidth: mapSource.image.width || 2048,
    imageHeight: mapSource.image.height || 1152,
    containerRef,
  });

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden select-none bg-[#06080e] touch-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className
      )}
      {...bind}
      tabIndex={0}
      aria-label={`${mapSource.name} world map`}
    >
      {/* 1. Hardware Accelerated Raster Map Layer (CSS 3D Transform) */}
      <div
        className="absolute top-0 left-0 origin-top-left pointer-events-none will-change-transform"
        style={{
          width: `${mapSource.image.width}px`,
          height: `${mapSource.image.height}px`,
          transform: `translate3d(${x}px, ${y}px, 0px) scale(${zoom})`,
          transition: isDragging ? "none" : "transform 0.05s ease-out",
        }}
      >
        {/* Blur-up Low-Res Thumbnail */}
        <img
          src={mapSource.thumbnail}
          alt=""
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-500 filter blur-md",
            isFullImageLoaded ? "opacity-0" : "opacity-100"
          )}
          aria-hidden="true"
        />

        {/* High-Resolution Illustrated WebP */}
        <img
          src={mapSource.image.url}
          alt=""
          onLoad={() => setIsFullImageLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            isFullImageLoaded ? "opacity-100" : "opacity-0"
          )}
          draggable={false}
        />
      </div>

      {/* 2. Soft Contrast Vignette (Ensures legibility of markers and labels) */}
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.75)] z-10"
        aria-hidden="true"
      />

      {/* 3. Faint Theme-Tinted Horizon Glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(200,255,87,0.03)_0%,transparent_70%)] z-10"
        aria-hidden="true"
      />

      {/* 4. Independent Interactive Vector & HTML Overlay Layer */}
      {renderOverlay && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
          {renderOverlay({ mapToViewport, zoom })}
        </div>
      )}
    </div>
  );
}
