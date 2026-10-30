/**
 * Renderable dock icon catalog (single source of truth for validation + discovery).
 *
 * Every id here resolves in `src/components/icons/adapter.ts` (ICON_MAP). Unknown ids
 * fall back to a hash-picked glyph, so the agent must use search_icons and pass only
 * catalog ids when creating/updating tabs and plugins.
 *
 * Ported from 636921a (full Phosphor catalog, 302 entries with SVG paths). Adapted:
 * only renderable ids are listed, SVG paths dropped (the dock renders via DockIcon),
 * no node:fs at runtime (static data), alias ids inherit their component keywords.
 */

export interface IconCatalogItem {
  id: string;
  label: string;
  category: string;
  keywords: string[];
}

/**
 * Mirrors `resolveIcon` in `src/components/icons/adapter.ts`: lowercase,
 * trim, strip separators. Validation must accept exactly what the dock
 * resolves (e.g. `Map-Pin`, `map_pin` and `mappin` are the same icon).
 */
export function normalizeIconId(id: string): string {
  return id.toLowerCase().trim().replace(/[-_\s]/g, "");
}

const ICONS: Record<string, Omit<IconCatalogItem, "id">> = {
  "agent": { label: "Sparkle (agent)", category: "art", keywords: ["agent", "sparkle", "aesthetic", "flair", "glow", "artistic"] },
  "ai": { label: "Brain (ai)", category: "learning and school", keywords: ["ai", "brain", "cognition", "memory", "intellect", "neuroscience", "mind", "retention"] },
  "api": { label: "Plugs Connected", category: "general", keywords: ["api", "plugsconnected"] },
  "art": { label: "Palette (art)", category: "art", keywords: ["art", "palette", "painting", "colors", "pigment", "visual-arts", "studio"] },
  "atom": { label: "Atom", category: "science", keywords: ["atom", "physics", "quantum", "particle", "nuclear", "orbital", "science"] },
  "bookmark": { label: "Bookmark Simple", category: "general", keywords: ["bookmark", "bookmarksimple"] },
  "bookmarksimple": { label: "Bookmark Simple", category: "general", keywords: ["bookmarksimple"] },
  "bookopen": { label: "Books (bookopen)", category: "learning and school", keywords: ["bookopen", "books", "library", "canon", "reading-list", "bibliography"] },
  "books": { label: "Books", category: "learning and school", keywords: ["books", "library", "canon", "reading-list", "bibliography"] },
  "brain": { label: "Brain", category: "learning and school", keywords: ["brain", "cognition", "memory", "intellect", "neuroscience", "mind", "retention"] },
  "browser": { label: "Globe (browser)", category: "maps and travel", keywords: ["browser", "globe", "world", "earth", "international", "planetary", "regions"] },
  "calculator": { label: "Calculator", category: "math", keywords: ["calculator", "arithmetic", "computation", "numeric", "formula"] },
  "cards": { label: "Cards", category: "learning and school", keywords: ["cards", "flashcards", "study", "memorize", "deck", "review", "drills"] },
  "chartlineup": { label: "Chart Line Up", category: "general", keywords: ["chartlineup"] },
  "chatcircle": { label: "Chat Circle", category: "general", keywords: ["chatcircle"] },
  "check": { label: "Check (check)", category: "status", keywords: ["check", "tick", "confirm", "ok", "passed"] },
  "checkcircle": { label: "Check Circle", category: "general", keywords: ["checkcircle"] },
  "client": { label: "Plugs Connected", category: "general", keywords: ["client", "plugsconnected"] },
  "clock": { label: "Clock", category: "general", keywords: ["clock"] },
  "code": { label: "Code", category: "code", keywords: ["code", "programming", "syntax", "source", "script", "developer"] },
  "coins": { label: "Coins", category: "finance", keywords: ["coins", "money", "currency", "cash", "specie", "change"] },
  "communication": { label: "Chat Circle", category: "general", keywords: ["communication", "chatcircle"] },
  "compare": { label: "Scales (compare)", category: "science", keywords: ["compare", "scales", "equilibrium", "mass", "weight", "measurement"] },
  "compass": { label: "Mariners Compass", category: "history", keywords: ["compass", "mariners", "age-of-discovery", "navigation", "exploration"] },
  "curl": { label: "Terminal Window", category: "general", keywords: ["curl", "terminalwindow"] },
  "data": { label: "Folder (data)", category: "files and documents", keywords: ["data", "folder", "directory", "filesystem", "workspace", "archive"] },
  "database": { label: "Folder (database)", category: "files and documents", keywords: ["database", "folder", "directory", "filesystem", "workspace", "archive"] },
  "db": { label: "Folder (db)", category: "files and documents", keywords: ["db", "folder", "directory", "filesystem", "workspace", "archive"] },
  "debug": { label: "Wrench (debug)", category: "tools", keywords: ["debug", "wrench", "tool", "maintenance", "fix", "repair", "utility"] },
  "deck": { label: "Cards (deck)", category: "learning and school", keywords: ["deck", "cards", "flashcards", "study", "memorize", "review", "drills"] },
  "devtools": { label: "Wrench (devtools)", category: "tools", keywords: ["devtools", "wrench", "tool", "maintenance", "fix", "repair", "utility"] },
  "diff": { label: "Scales (diff)", category: "science", keywords: ["diff", "scales", "equilibrium", "mass", "weight", "measurement"] },
  "doc": { label: "File Text", category: "general", keywords: ["doc", "filetext"] },
  "docs": { label: "File Text", category: "general", keywords: ["docs", "filetext"] },
  "documentation": { label: "File Text", category: "general", keywords: ["documentation", "filetext"] },
  "extension": { label: "Puzzle Piece", category: "general", keywords: ["extension", "puzzlepiece"] },
  "files": { label: "Folder (files)", category: "files and documents", keywords: ["files", "folder", "directory", "filesystem", "workspace", "archive"] },
  "filesmulti": { label: "Files (filesmulti)", category: "files and documents", keywords: ["filesmulti", "files", "documents", "records", "batch", "bundle", "workspace"] },
  "filetext": { label: "File Text", category: "general", keywords: ["filetext"] },
  "finance": { label: "Coins (finance)", category: "finance", keywords: ["finance", "coins", "money", "currency", "cash", "specie", "change"] },
  "flame": { label: "Flame", category: "philosophy", keywords: ["flame", "heraclitus", "stoicism", "logos", "inner-citadel"] },
  "flashcards": { label: "Cards (flashcards)", category: "learning and school", keywords: ["flashcards", "cards", "study", "memorize", "deck", "review", "drills"] },
  "flask": { label: "Flask", category: "science", keywords: ["flask", "chemistry", "experiment", "lab", "reaction", "beaker"] },
  "folder": { label: "Folder", category: "files and documents", keywords: ["folder", "directory", "filesystem", "workspace", "archive"] },
  "gear": { label: "Gear", category: "tools", keywords: ["gear", "settings", "preferences", "configuration", "engine"] },
  "globe": { label: "Globe", category: "maps and travel", keywords: ["globe", "world", "earth", "international", "planetary", "regions"] },
  "globesimple": { label: "Globe (globesimple)", category: "maps and travel", keywords: ["globesimple", "globe", "world", "earth", "international", "planetary", "regions"] },
  "graduationcap": { label: "Graduation Cap", category: "general", keywords: ["graduationcap"] },
  "health": { label: "Heartbeat (health)", category: "health", keywords: ["health", "heartbeat", "cardio", "pulse", "vital-signs", "physiology", "ecg"] },
  "heartbeat": { label: "Heartbeat", category: "health", keywords: ["heartbeat", "cardio", "pulse", "vital-signs", "physiology", "ecg"] },
  "history": { label: "Books (history)", category: "learning and school", keywords: ["history", "books", "library", "canon", "reading-list", "bibliography"] },
  "http": { label: "Globe (http)", category: "maps and travel", keywords: ["http", "globe", "world", "earth", "international", "planetary", "regions"] },
  "inspector": { label: "Eye (inspector)", category: "art", keywords: ["inspector", "eye", "visual", "perception", "gaze", "perspective"] },
  "json": { label: "Code (json)", category: "code", keywords: ["json", "code", "programming", "syntax", "source", "script", "developer"] },
  "language": { label: "Translate (language)", category: "language", keywords: ["language", "translate", "bilingual", "linguistics", "vocabulary", "polyglot", "translation"] },
  "layers": { label: "Stack (layers)", category: "tools", keywords: ["layers", "stack", "components", "architecture", "system"] },
  "lightbulb": { label: "Lightbulb", category: "philosophy", keywords: ["lightbulb", "enlightenment", "reason", "logos", "rationalism"] },
  "lightning": { label: "Lightning", category: "general", keywords: ["lightning"] },
  "llm": { label: "Brain (llm)", category: "learning and school", keywords: ["llm", "brain", "cognition", "memory", "intellect", "neuroscience", "mind", "retention"] },
  "map": { label: "Mariners Compass (map)", category: "history", keywords: ["map", "compass", "mariners", "age-of-discovery", "navigation", "exploration"] },
  "mappin": { label: "Map Pin", category: "general", keywords: ["mappin"] },
  "maps": { label: "Mariners Compass (maps)", category: "history", keywords: ["maps", "compass", "mariners", "age-of-discovery", "navigation", "exploration"] },
  "maptrifold": { label: "Mariners Compass (maptrifold)", category: "history", keywords: ["maptrifold", "compass", "mariners", "age-of-discovery", "navigation", "exploration"] },
  "math": { label: "Calculator (math)", category: "math", keywords: ["math", "calculator", "arithmetic", "computation", "numeric", "formula"] },
  "media": { label: "Eye (media)", category: "art", keywords: ["media", "eye", "visual", "perception", "gaze", "perspective"] },
  "model": { label: "CPU (model)", category: "code", keywords: ["model", "cpu", "processor", "registers", "assembly", "silicon", "architecture"] },
  "music": { label: "Music Notes", category: "general", keywords: ["music", "musicnotes"] },
  "musicnotes": { label: "Music Notes", category: "general", keywords: ["musicnotes"] },
  "network": { label: "Globe (network)", category: "maps and travel", keywords: ["network", "globe", "world", "earth", "international", "planetary", "regions"] },
  "notepencil": { label: "Note Pencil", category: "general", keywords: ["notepencil"] },
  "notes": { label: "Note Pencil", category: "general", keywords: ["notes", "notepencil"] },
  "palette": { label: "Palette", category: "art", keywords: ["palette", "painting", "colors", "pigment", "visual-arts", "studio"] },
  "paperclip": { label: "Paperclip", category: "files and documents", keywords: ["paperclip", "attachment", "source", "tinyfish", "link"] },
  "pencil": { label: "Pencil (pencil)", category: "language", keywords: ["pencil", "writing", "notes", "drafting"] },
  "pentool": { label: "Target", category: "general", keywords: ["pentool", "target"] },
  "philosophy": { label: "Scales (philosophy)", category: "science", keywords: ["philosophy", "scales", "equilibrium", "mass", "weight", "measurement"] },
  "plugin": { label: "Puzzle Piece", category: "general", keywords: ["plugin", "puzzlepiece"] },
  "plus": { label: "Plus", category: "general", keywords: ["plus"] },
  "prompt": { label: "Chat Circle", category: "general", keywords: ["prompt", "chatcircle"] },
  "puzzle": { label: "Puzzle Piece", category: "general", keywords: ["puzzle", "puzzlepiece"] },
  "quests": { label: "Target", category: "general", keywords: ["quests", "target"] },
  "rest": { label: "Plugs Connected", category: "general", keywords: ["rest", "plugsconnected"] },
  "robot": { label: "Robot", category: "general", keywords: ["robot"] },
  "scale": { label: "Scales (scale)", category: "science", keywords: ["scale", "scales", "equilibrium", "mass", "weight", "measurement"] },
  "scales": { label: "Scales", category: "science", keywords: ["scales", "equilibrium", "mass", "weight", "measurement"] },
  "science": { label: "Flask (science)", category: "science", keywords: ["science", "flask", "chemistry", "experiment", "lab", "reaction", "beaker"] },
  "settings": { label: "Gear (settings)", category: "tools", keywords: ["settings", "gear", "preferences", "configuration", "engine"] },
  "shield": { label: "Shield", category: "history", keywords: ["shield", "armor", "defense", "heraldry", "crusades", "warfare"] },
  "sliders": { label: "Sliders", category: "media", keywords: ["sliders", "levels", "tuning", "filters", "equalizer"] },
  "sources": { label: "Paperclip (sources)", category: "files and documents", keywords: ["sources", "paperclip", "attachment", "source", "tinyfish", "link"] },
  "sparkle": { label: "Sparkle", category: "art", keywords: ["sparkle", "aesthetic", "flair", "glow", "artistic"] },
  "sparkles": { label: "Sparkle (sparkles)", category: "art", keywords: ["sparkles", "sparkle", "aesthetic", "flair", "glow", "artistic"] },
  "spec": { label: "File Text", category: "general", keywords: ["spec", "filetext"] },
  "sql": { label: "Folder (sql)", category: "files and documents", keywords: ["sql", "folder", "directory", "filesystem", "workspace", "archive"] },
  "stack": { label: "Stack", category: "tools", keywords: ["stack", "layers", "components", "architecture", "system"] },
  "status": { label: "Check Circle", category: "general", keywords: ["status", "checkcircle"] },
  "storage": { label: "Folder (storage)", category: "files and documents", keywords: ["storage", "folder", "directory", "filesystem", "workspace", "archive"] },
  "store": { label: "Folder (store)", category: "files and documents", keywords: ["store", "folder", "directory", "filesystem", "workspace", "archive"] },
  "storefront": { label: "Storefront", category: "general", keywords: ["storefront"] },
  "sword": { label: "Sword", category: "history", keywords: ["sword", "battle", "military", "gladiator", "knighthood"] },
  "target": { label: "Target", category: "general", keywords: ["target"] },
  "terminal": { label: "Terminal (terminal)", category: "code", keywords: ["terminal", "prompt", "sh", "zsh", "stdout"] },
  "terminalwindow": { label: "Terminal Window", category: "general", keywords: ["terminalwindow"] },
  "test": { label: "Check Circle", category: "general", keywords: ["test", "checkcircle"] },
  "tester": { label: "Check Circle", category: "general", keywords: ["tester", "checkcircle"] },
  "tests": { label: "Check Circle", category: "general", keywords: ["tests", "checkcircle"] },
  "theme": { label: "Palette (theme)", category: "art", keywords: ["theme", "palette", "painting", "colors", "pigment", "visual-arts", "studio"] },
  "tools": { label: "Wrench (tools)", category: "tools", keywords: ["tools", "wrench", "tool", "maintenance", "fix", "repair", "utility"] },
  "translate": { label: "Translate", category: "language", keywords: ["translate", "bilingual", "linguistics", "vocabulary", "polyglot", "translation"] },
  "travel": { label: "Map Pin", category: "general", keywords: ["travel", "mappin"] },
  "world": { label: "Mariners Compass (world)", category: "history", keywords: ["world", "compass", "mariners", "age-of-discovery", "navigation", "exploration"] },
  "wrench": { label: "Wrench", category: "tools", keywords: ["wrench", "tool", "maintenance", "fix", "repair", "utility"] },
};

export function searchCatalog(
  query: string,
  limit = 8
): IconCatalogItem[] {
  const tokens = query
    .toLowerCase()
    .trim()
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map((t) => t.replace(/[-_]/g, ""));
  const all: IconCatalogItem[] = Object.entries(ICONS).map(([id, rest]) => ({
    id,
    ...rest,
  }));
  if (tokens.length === 0) return all.slice(0, limit);
  const scored: { item: IconCatalogItem; score: number }[] = [];
  for (const item of all) {
    let score = 0;
    for (const t of tokens) {
      if (item.id === t) score += 50;
      else if (item.id.includes(t)) score += 20;
      if (item.label.toLowerCase() === t) score += 30;
      else if (item.label.toLowerCase().includes(t)) score += 15;
      if (item.category.toLowerCase().includes(t)) score += 10;
      for (const kw of item.keywords) {
        if (kw === t) score += 25;
        else if (kw.includes(t)) score += 10;
      }
    }
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ item }) => item);
}

export function listCategories(): { category: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const item of Object.values(ICONS)) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return Object.entries(counts).map(([category, count]) => ({ category, count }));
}

export function isValidIconId(id: string): boolean {
  if (!id) return false;
  return Boolean(ICONS[normalizeIconId(id)]);
}

export function findCloseMatches(id: string, limit = 5): string[] {
  const target = normalizeIconId(id);
  const keys = Object.keys(ICONS);
  const substrings = keys.filter((k) => k.includes(target) || target.includes(k));
  if (substrings.length >= limit) return substrings.slice(0, limit);
  const searchResults = searchCatalog(target, limit).map((r) => r.id);
  return Array.from(new Set([...substrings, ...searchResults])).slice(0, limit);
}
