import type { ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { spring, prefersReducedMotion } from "@/lib/motion";

export type DockSurfaceVariant = "default" | "frameless" | "sheet" | "fullscreen";

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

  if (variant === "sheet") {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            layoutId={layoutId}
            initial={{
              opacity: 0,
              y: prefersReducedMotion() ? 0 : 28,
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
              y: prefersReducedMotion() ? 0 : 20,
              scale: prefersReducedMotion() ? 1 : 0.95,
              transition: { duration: 0.18 },
            }}
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-[560px] pointer-events-auto",
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

  return (
    <div
      className={cn(
        "w-full flex flex-col items-center justify-start select-none",
        variant === "frameless"
          ? "pt-[calc(var(--dock-bottom,88px)+28px)] pb-10"
          : "pt-[calc(var(--dock-bottom,88px)+20px)] pb-12 px-4",
        className
      )}
    >
      {children}
    </div>
  );
}
