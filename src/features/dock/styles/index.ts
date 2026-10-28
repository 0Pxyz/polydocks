export type DockStyleId = "glass" | "solid" | "bare" | "lift";
export type DockPosition = "top" | "bottom";

export interface DockStyleMeta {
  id: DockStyleId;
  name: string;
  description: string;
  capsuleClass: string;
  activeItemClass: string;
  inactiveItemClass: string;
  enableLift?: boolean;
}

export const DOCK_STYLES: Record<DockStyleId, DockStyleMeta> = {
  glass: {
    id: "glass",
    name: "Glass",
    description: "Translucent obsidian capsule with backdrop blur and soft shadow",
    capsuleClass: "bg-[#0c0e14]/90 backdrop-blur-xl shadow-2xl",
    activeItemClass:
      "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border border-[var(--accent-lime)]/30 shadow-[0_0_12px_rgba(200,255,87,0.2)]",
    inactiveItemClass: "text-[#9aa5b8] hover:text-white hover:bg-white/[0.08]",
  },
  solid: {
    id: "solid",
    name: "Solid",
    description: "Opaque obsidian surface with clean contrast and no blur",
    capsuleClass: "bg-[#0c0e14] shadow-xl",
    activeItemClass: "bg-white/10 text-white shadow-sm",
    inactiveItemClass: "text-[#9aa5b8] hover:text-white hover:bg-white/[0.06]",
  },
  bare: {
    id: "bare",
    name: "Bare",
    description: "Frameless floating icons sitting directly on the surface",
    capsuleClass: "bg-transparent shadow-none",
    activeItemClass:
      "bg-[var(--accent-lime)]/20 text-[var(--accent-lime)] shadow-[0_0_10px_rgba(200,255,87,0.15)]",
    inactiveItemClass: "text-[#9aa5b8] hover:text-white hover:bg-white/[0.08]",
  },
  lift: {
    id: "lift",
    name: "Lift",
    description: "Translucent capsule with spring magnification on hover",
    capsuleClass: "bg-[#0c0e14]/90 backdrop-blur-xl shadow-2xl",
    activeItemClass:
      "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border border-[var(--accent-lime)]/30 shadow-[0_0_12px_rgba(200,255,87,0.2)] scale-105",
    inactiveItemClass: "text-[#9aa5b8] hover:text-white hover:bg-white/[0.08]",
    enableLift: true,
  },
};
