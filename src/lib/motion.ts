import type { Transition, Variants } from "motion/react";

/**
 * Checks if the user prefers reduced motion (client-side).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shared spring transitions for Polymax UI
 */
export const spring = {
  soft: {
    type: "spring",
    stiffness: 180,
    damping: 24,
    mass: 1,
  } satisfies Transition,
  snappy: {
    type: "spring",
    stiffness: 350,
    damping: 30,
    mass: 0.8,
  } satisfies Transition,
  gentle: {
    type: "spring",
    stiffness: 100,
    damping: 20,
    mass: 1.2,
  } satisfies Transition,
};

/**
 * Standard easing transitions
 */
export const transitions = {
  easeOut: {
    duration: 0.2,
    ease: [0, 0, 0.2, 1],
  } satisfies Transition,
  easeInOut: {
    duration: 0.25,
    ease: [0.4, 0, 0.2, 1],
  } satisfies Transition,
};

/**
 * Animation variants respecting prefers-reduced-motion
 */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.easeOut },
  exit: { opacity: 0, transition: transitions.easeOut },
};

export const slideUp: Variants = {
  initial: {
    opacity: 0,
    y: prefersReducedMotion() ? 0 : 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: spring.soft,
  },
  exit: {
    opacity: 0,
    y: prefersReducedMotion() ? 0 : -8,
    transition: transitions.easeOut,
  },
};

export const dockMotion: Variants = {
  collapsed: {
    opacity: 1,
    transition: spring.snappy,
  },
  expanded: {
    opacity: 1,
    transition: spring.soft,
  },
};
