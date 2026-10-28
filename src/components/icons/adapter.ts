import type { ComponentType } from "react";
import {
  Compass,
  Folder,
  Cards,
  Paperclip,
  Globe,
  PenNib,
  Palette,
  TerminalWindow,
  Sparkle,
  Stack,
  Scales,
  BookmarkSimple,
  Target,
  Flame,
  Brain,
  Atom,
  Code,
  Books,
  GraduationCap,
  ChartLineUp,
  MusicNotes,
  Robot,
  Sword,
  Lightning,
  NotePencil,
  Files,
  Clock,
  Flask,
  Calculator,
  Translate,
  Heartbeat,
  Coins,
  MapPin,
  FileText,
  ChatCircle,
  Wrench,
  CheckCircle,
  Eye,
  Sliders,
  Shield,
  Lightbulb,
  Plus,
} from "@phosphor-icons/react";

export type IconComponent = ComponentType<{
  size?: number | string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
  style?: React.CSSProperties;
}>;

/**
 * Registry adapter mapping legacy Lucide names, tool ids, and Phosphor names
 * to canonical Phosphor icon components.
 */
const ICON_MAP: Record<string, IconComponent> = {
  // Builtin dock tools
  world: Compass,
  compass: Compass,
  map: Compass,
  maps: Compass,
  maptrifold: Compass,

  settings: Sliders,
  plus: Plus,

  files: Folder,
  folder: Folder,

  flashcards: Cards,
  cards: Cards,
  deck: Cards,

  sources: Paperclip,
  paperclip: Paperclip,

  browser: Globe,
  globe: Globe,
  globesimple: Globe,

  notes: NotePencil,
  notepencil: NotePencil,
  pencil: NotePencil,

  quests: Target,
  target: Target,
  pentool: Target, // Mismatch fix: old penTool mapped to target
  sword: Sword,

  theme: Palette,
  palette: Palette,

  terminal: TerminalWindow,
  terminalwindow: TerminalWindow,

  agent: Sparkle,
  sparkle: Sparkle,
  sparkles: Sparkle, // Legacy Lucide adapter

  // Common legacy tab icons & catalog concepts
  layers: Stack,
  stack: Stack,
  scale: Scales,
  scales: Scales,
  bookmark: BookmarkSimple,
  bookmarksimple: BookmarkSimple,
  flame: Flame,
  brain: Brain,
  atom: Atom,
  science: Flask,
  flask: Flask,
  math: Calculator,
  calculator: Calculator,
  code: Code,
  language: Translate,
  translate: Translate,
  music: MusicNotes,
  musicnotes: MusicNotes,
  art: Palette,
  history: Books,
  books: Books,
  bookopen: Books,
  philosophy: Scales,
  health: Heartbeat,
  heartbeat: Heartbeat,
  finance: Coins,
  coins: Coins,
  travel: MapPin,
  mappin: MapPin,
  filetext: FileText,
  media: Eye,
  communication: ChatCircle,
  chatcircle: ChatCircle,
  tools: Wrench,
  wrench: Wrench,
  status: CheckCircle,
  checkcircle: CheckCircle,
  sliders: Sliders,
  shield: Shield,
  lightbulb: Lightbulb,
  robot: Robot,
  lightning: Lightning,
  graduationcap: GraduationCap,
  chartlineup: ChartLineUp,
  clock: Clock,
  filesmulti: Files,
};

/**
 * Resolves an icon identifier (case-insensitive) to a typed Phosphor component.
 * Guaranteed to never fail; falls back to neutral Stack icon.
 */
export function resolveIcon(name?: string | null): IconComponent {
  if (!name) return Stack;
  const clean = name.trim().toLowerCase().replace(/[-_]/g, "");
  return ICON_MAP[clean] || Stack;
}

export {
  Compass,
  Folder,
  Cards,
  Paperclip,
  Globe,
  PenNib,
  Palette,
  TerminalWindow,
  Sparkle,
  Stack,
  Scales,
  BookmarkSimple,
  Target,
  Flame,
  Brain,
  Atom,
  Code,
  Books,
  GraduationCap,
  ChartLineUp,
  MusicNotes,
  Robot,
  Sword,
  Lightning,
  NotePencil,
  Files,
};
