import type { ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { spring, prefersReducedMotion } from "@/lib/motion";
import { useThemeStore } from "@/lib/theme";

export type DockSurfaceVariant = "default" | "frameless" | "sheet" | "fullscreen" | "immersive";

interface DockSurfaceProps {
  children: ReactNode;
  className?: string;
  frameless?: boolean;
  variant?: DockSurfaceVariant;
  layoutId?: string;
  isOpen?: boolean;
}

/**
 * DockSurface coordinates viewport surfaces with the Agentic Dock.
 * - default/frameless: reserves top-dock height so surfaces never sit underneath the dock HUD.
 * - sheet: anchors a floating capsule to the bottom of the viewport (max-w ~560px),
 *   scaling smoothly into or out of the dock with spring motion.
 * - fullscreen: expands to an immersive, full-screen viewport.
 */
export function DockSurface({
  children,
  className,
  frameless = false,
  variant: propVariant,
  layoutId,
  isOpen = true,
}: DockSurfaceProps) {
  const variant: DockSurfaceVariant =
    propVariant ?? (frameless ? "frameless" : "default");
  const dockPosition = useThemeStore((s) => s.dockPosition);
  const isBottom = dockPosition === "bottom";

  if (variant === "sheet") {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            layoutId={layoutId}
            initial={{
              opacity: 0,
              y: prefersReducedMotion() ? 0 : isBottom ? -28 : 28,
              scale: prefersReducedMotion() ? 1 : 0.96,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: spring.soft,
            }}
            exit={{
              opacity: 0,
              y: prefersReducedMotion() ? 0 : isBottom ? -20 : 20,
              scale: prefersReducedMotion() ? 1 : 0.95,
              transition: { duration: 0.18 },
            }}
            className={cn(
              "fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto",
              isBottom ? "top-6" : "bottom-6",
              className
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (variant === "fullscreen") {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            layoutId={layoutId}
            initial={{ opacity: 0, scale: prefersReducedMotion() ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1, transition: spring.soft }}
            exit={{ opacity: 0, scale: prefersReducedMotion() ? 1 : 0.98, transition: { duration: 0.2 } }}
            className={cn(
              "fixed inset-0 z-50 flex flex-col items-center justify-between bg-[var(--bg-void)]/95 backdrop-blur-2xl p-6 sm:p-10 pointer-events-auto overflow-y-auto",
              className
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (variant === "immersive") {
    return (
      <div
        className={cn(
          "w-full flex-1 flex flex-col items-center justify-start select-none bg-transparent",
          isBottom
            ? "pb-[calc(var(--dock-bottom-offset,var(--dock-offset,88px))+12px)] pt-3"
            : "pt-[calc(var(--dock-top-offset,var(--dock-offset,88px))+12px)] pb-3",
          className
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full flex-1 flex flex-col items-center justify-start select-none",
        isBottom
          ? variant === "frameless"
            ? "pb-[calc(var(--dock-bottom-offset,var(--dock-offset,88px))+12px)] pt-4"
            : "pb-[calc(var(--dock-bottom-offset,var(--dock-offset,88px))+12px)] pt-6 px-4"
          : variant === "frameless"
            ? "pt-[calc(var(--dock-top-offset,var(--dock-offset,88px))+12px)] pb-4"
            : "pt-[calc(var(--dock-top-offset,var(--dock-offset,88px))+12px)] pb-6 px-4",
        className
      )}
    >
      {children}
    </div>
  );
}
