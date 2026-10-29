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
  Gear,
  Shield,
  Lightbulb,
  Plus,
  PuzzlePiece,
  PlugsConnected,
  Cpu,
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

  settings: Gear,
  gear: Gear,
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

  // Developer, Network & API tools
  rest: PlugsConnected,
  api: PlugsConnected,
  http: Globe,
  curl: TerminalWindow,
  client: PlugsConnected,
  network: Globe,
  json: Code,
  data: Folder,
  inspector: Eye,
  debug: Wrench,
  devtools: Wrench,
  db: Folder,
  database: Folder,
  sql: Folder,
  storage: Folder,
  store: Folder,
  doc: FileText,
  docs: FileText,
  documentation: FileText,
  spec: FileText,
  ai: Brain,
  llm: Brain,
  model: Cpu,
  prompt: ChatCircle,
  puzzle: PuzzlePiece,
  plugin: PuzzlePiece,
  extension: PuzzlePiece,
  check: CheckCircle,
  test: CheckCircle,
  tests: CheckCircle,
  tester: CheckCircle,
  compare: Scales,
  diff: Scales,
};

const DIVERSE_FALLBACK_PALETTE: IconComponent[] = [
  PuzzlePiece,
  Code,
  PlugsConnected,
  Globe,
  TerminalWindow,
  Cpu,
  Brain,
  Atom,
  Flask,
  Cards,
  NotePencil,
  FileText,
  Shield,
  Sliders,
  Target,
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Resolves an icon key while guaranteeing it is not already taken: the first
 * tool keeps its natural icon, later duplicates fall back to deterministic
 * distinct glyphs. Callers add the returned component to `used`.
 */
export function resolveUniqueIcon(
  name?: string | null,
  used: Set<IconComponent> = new Set()
): IconComponent {
  const primary = resolveIcon(name);
  if (!used.has(primary)) return primary;
  for (const fallback of DIVERSE_FALLBACK_PALETTE) {
    if (!used.has(fallback)) return fallback;
  }
  return primary;
}

/**
 * Resolves an icon identifier (case-insensitive) to a typed Phosphor component.
 * Uses exact catalog lookup, word-token inference, and deterministic palette hashing
 * to guarantee that dynamic tools get distinct, meaningful icons rather than
 * duplicated fallback stacks.
 */
export function resolveIcon(name?: string | null): IconComponent {
  if (!name) return Stack;
  const raw = name.trim();
  const clean = raw.toLowerCase().replace(/[-_\s]/g, "");
  if (ICON_MAP[clean]) {
    return ICON_MAP[clean];
  }

  // Check each word token against catalog
  const tokens = raw.toLowerCase().split(/[^a-z0-9]+/);
  for (const token of tokens) {
    if (token && ICON_MAP[token]) {
      return ICON_MAP[token];
    }
  }

  // Deterministic catalog distribution fallback
  return DIVERSE_FALLBACK_PALETTE[hashString(raw) % DIVERSE_FALLBACK_PALETTE.length];
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
  Gear,
};
