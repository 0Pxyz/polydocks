import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface DockSurfaceProps {
  children: ReactNode;
  className?: string;
  frameless?: boolean;
}

/**
 * DockSurface reserves the dynamic height of the Agentic Dock
 * using the --dock-bottom CSS variable so child tools and surfaces
 * never touch or sit underneath the dock HUD across viewports.
 */
export function DockSurface({
  children,
  className,
  frameless = false,
}: DockSurfaceProps) {
  return (
    <div
      className={cn(
        "w-full flex flex-col items-center justify-start select-none",
        frameless
          ? "pt-[calc(var(--dock-bottom,88px)+28px)] pb-10"
          : "pt-[calc(var(--dock-bottom,88px)+20px)] pb-12 px-4",
        className
      )}
    >
      {children}
    </div>
  );
}
