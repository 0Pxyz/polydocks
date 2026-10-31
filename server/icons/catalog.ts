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
 *
 * v2 (additive): nothing below was removed or renamed. Added:
 *  1. EXTRA_KEYWORDS  – richer EN/PT keywords merged into EXISTING ids (zero risk).
 *  2. EXTRA_ICONS     – new ids, OFF by default (INCLUDE_EXTRA_ICONS = false) until they
 *                       are registered in adapter.ts ICON_MAP (see ADAPTER_SNIPPET).
 *  3. suggestIcons()  – intent-based search for agents (+ ICON_SELECTION_GUIDE prompt).
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

// ─────────────────────────────────────────────────────────────────────────────
// v2 ADDITIONS (nothing above was changed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (1) Extra keywords merged into EXISTING ids. Safe: ids/labels/categories untouched,
 * so validation and rendering behave exactly as before; only discovery improves.
 * Mixed EN + PT so the agent finds icons by purpose ("agente", "memória", "missão").
 */
const EXTRA_KEYWORDS: Record<string, string[]> = {
  // AI & agents
  agent: ["bot", "assistant", "assistente", "autonomous", "autonomo", "executor", "worker", "agente", "orchestrator"],
  robot: ["agent", "agente", "bot", "assistant", "assistente", "autonomous", "autonomo", "executor", "worker"],
  ai: ["ia", "artificial-intelligence", "inteligencia", "reasoning", "raciocinio", "thinking", "intelligence"],
  brain: ["ia", "thinking", "reasoning", "raciocinio", "intelligence", "inteligencia", "knowledge", "conhecimento"],
  llm: ["language-model", "gpt", "inference", "inferencia", "prompt", "chatbot"],
  model: ["inference", "inferencia", "modelo", "weights", "compute", "runtime", "llm"],
  prompt: ["chat", "conversa", "message", "mensagem", "ask", "instruction", "instrucao"],
  sparkle: ["generate", "gerar", "magic", "ai-action", "suggestion", "sugestao", "enhance", "melhorar"],
  sparkles: ["generative", "generativo", "ai-features", "magic", "highlight", "novo"],
  // integrations
  api: ["endpoint", "integration", "integracao", "mcp", "connector", "conector"],
  client: ["mcp", "connector", "conector", "integration", "integracao"],
  rest: ["endpoint", "mcp", "connector", "integration", "integracao"],
  plugin: ["skill", "addon", "module", "modulo", "extensao"],
  extension: ["skill", "addon", "module", "modulo", "plugin"],
  puzzle: ["skill", "addon", "module", "modulo", "plugin"],
  // dev
  terminalwindow: ["cli", "shell", "bash", "command", "comando", "console"],
  terminal: ["cli", "shell", "bash", "command", "comando", "console"],
  curl: ["http", "request", "cli", "shell", "fetch"],
  http: ["web", "url", "website", "request", "site"],
  browser: ["web", "navegador", "url", "pwa", "webapp", "site"],
  json: ["schema", "config", "payload", "yaml", "object"],
  code: ["codigo", "snippet", "dev", "coding"],
  debug: ["bug", "erro", "error", "issue", "qa", "toolkit"],
  devtools: ["toolkit", "bug", "inspect", "ferramentas"],
  tools: ["toolkit", "ferramentas", "skills", "capabilities", "function-calling"],
  stack: ["tech-stack", "arquitetura", "camadas", "sistema"],
  layers: ["tech-stack", "arquitetura", "camadas", "sistema"],
  diff: ["changes", "mudancas", "review", "pull-request", "commit"],
  // data / memory
  database: ["db", "sql", "storage", "records", "tables", "tabelas", "rag", "vector", "memory", "memoria"],
  db: ["database", "records", "tables", "tabelas", "rag", "vector"],
  sql: ["database", "query", "tables", "tabelas", "records"],
  data: ["dataset", "records", "dados", "tables"],
  storage: ["armazenamento", "server", "servidor", "files", "assets"],
  // exploration / maps / game
  compass: ["bussola", "direcao", "orientation", "orientacao"],
  map: ["mapa", "territory", "territorio", "atlas", "regions", "regioes", "knowledge-map"],
  maps: ["mapa", "territory", "territorio", "atlas", "regions", "regioes"],
  maptrifold: ["mapa", "territory", "territorio", "atlas", "regions", "regioes", "knowledge-map"],
  world: ["mundo", "global", "territory", "territorio"],
  target: ["goal", "objetivo", "quest", "missao", "mission", "focus", "foco", "kpi"],
  quests: ["quest", "goal", "objetivo", "missao", "mission", "challenge", "desafio"],
  pentool: ["goal", "objetivo", "quest", "missao", "focus"],
  sword: ["challenge", "desafio", "duel", "duelo", "combat", "pvp"],
  shield: ["guardrails", "protection", "protecao", "safety", "guild", "guilda"],
  flame: ["streak", "trending", "passion", "paixao", "hot"],
  lightbulb: ["idea", "ideia", "insight", "tip", "dica", "concept", "conceito"],
  // observe / search
  inspector: ["observe", "observar", "vision", "visao", "monitor", "preview"],
  media: ["observe", "vision", "visao", "monitor", "preview", "image", "video"],
  // status / action
  lightning: ["fast", "rapido", "speed", "power", "energy", "instant", "trigger"],
  clock: ["time", "hora", "schedule", "agendar", "recent", "recente", "history-log", "cron"],
  sliders: ["parameters", "parametros", "temperature", "ajustar", "tuning", "controls"],
  gear: ["config", "engine", "motor", "system", "sistema"],
  checkcircle: ["success", "done", "feito", "approved", "aprovado", "completed"],
  status: ["success", "done", "state", "estado", "health-check"],
  test: ["success", "qa", "verified", "verificado"],
  tests: ["success", "qa", "verified", "verificado"],
  tester: ["success", "qa", "verified", "verificado"],
  chatcircle: ["chat", "conversation", "conversa", "message", "mensagem", "comment", "comentario", "support", "suporte"],
  communication: ["chat", "conversation", "conversa", "message", "mensagem", "social"],
  // business / media / learning
  chartlineup: ["growth", "crescimento", "analytics", "metrics", "metricas", "stats", "revenue"],
  coins: ["revenue", "receita", "payment", "pagamento", "price", "preco", "monetization", "monetizacao"],
  finance: ["revenue", "receita", "payment", "pagamento", "budget", "orcamento", "monetization"],
  storefront: ["shop", "loja", "marketplace", "offers", "ofertas", "catalog", "ecommerce"],
  graduationcap: ["course", "curso", "learn", "aprender", "mastery", "dominio", "school", "education"],
  notepencil: ["write", "escrever", "draft", "rascunho", "journal", "diario", "writing"],
  notes: ["write", "escrever", "draft", "rascunho", "journal", "diario"],
  translate: ["idioma", "i18n", "polyglot", "poliglota"],
  language: ["idioma", "i18n", "poliglota", "linguas"],
  flask: ["labs", "prototype", "prototipo", "mvp", "experimento"],
  atom: ["stem", "ciencia", "fisica"],
  books: ["biblioteca", "knowledge-base", "leitura", "reading"],
  history: ["historia", "timeline", "past", "passado"],
  cards: ["revisao", "spaced-repetition", "aprender", "quiz"],
  palette: ["design", "brand", "marca", "cores", "visual"],
  paperclip: ["anexo", "reference", "referencia", "citation", "fonte"],
  sources: ["anexo", "reference", "referencia", "citation", "fonte"],
  bookmark: ["save", "guardar", "pin", "read-later"],
  bookmarksimple: ["save", "guardar", "pin", "read-later"],
  folder: ["project", "projeto", "repository", "repositorio", "pasta"],
  filetext: ["report", "relatorio", "readme", "document", "documento", "spec"],
  doc: ["report", "relatorio", "readme", "document", "documento"],
  docs: ["report", "relatorio", "readme", "document", "documento", "guide"],
  documentation: ["report", "relatorio", "readme", "guide", "manual"],
  spec: ["report", "relatorio", "requirements", "requisitos", "document"],
  health: ["saude", "wellness", "bem-estar", "monitor", "uptime"],
  heartbeat: ["saude", "wellness", "bem-estar", "monitor", "uptime", "activity"],
};

for (const [id, extra] of Object.entries(EXTRA_KEYWORDS)) {
  const entry = ICONS[id];
  if (!entry) continue; // never invent ids here
  for (const kw of extra) if (!entry.keywords.includes(kw)) entry.keywords.push(kw);
}

/**
 * (2) NEW ids (Phosphor). OFF by default: these only render once each one is added to
 * ICON_MAP in `src/components/icons/adapter.ts` (otherwise the dock falls back to a
 * hash-picked glyph). After registering them, flip INCLUDE_EXTRA_ICONS to true.
 * Keys must already be normalized (lowercase, no separators).
 */
export const INCLUDE_EXTRA_ICONS = false;

const e = (label: string, category: string, keywords: string[]): Omit<IconCatalogItem, "id"> => ({
  label,
  category,
  keywords,
});

const EXTRA_ICONS: Record<string, Omit<IconCatalogItem, "id">> = {
  // AI & agents
  cpu: e("CPU", "ai", ["cpu", "model", "modelo", "inference", "inferencia", "compute", "processor", "llm", "runtime"]),
  treestructure: e("Tree Structure", "ai", ["orchestrator", "orquestrador", "hierarchy", "hierarquia", "subagents", "planner", "plan", "delegation", "delegar", "taxonomy"]),
  graph: e("Graph", "ai", ["knowledge-graph", "grafo", "nodes", "relations", "relacoes", "network-of-ideas", "territories"]),
  flowarrow: e("Flow Arrow", "ai", ["workflow", "pipeline", "chain", "fluxo", "steps", "automation", "automacao", "handoff"]),
  memory: e("Memory", "ai", ["memory", "memoria", "context", "contexto", "state", "vector", "embeddings", "recall"]),
  magicwand: e("Magic Wand", "ai", ["transform", "transformar", "auto", "autofix", "rewrite", "reescrever", "enhance", "one-click"]),
  toolbox: e("Toolbox", "ai", ["tools", "ferramentas", "toolkit", "skills", "capabilities", "capacidades", "function-calling"]),
  plugsconnected: e("Plugs Connected", "integration", ["mcp", "connector", "conector", "integration", "integracao", "api", "client"]),
  plugs: e("Plugs", "integration", ["disconnected", "offline", "connect", "ligar", "plugin-missing"]),
  puzzlepiece: e("Puzzle Piece", "integration", ["plugin", "extension", "extensao", "addon", "module", "modulo", "skill"]),
  webhookslogo: e("Webhooks Logo", "integration", ["webhook", "event", "evento", "trigger", "gatilho", "callback", "http"]),
  chatteardrop: e("Chat Teardrop", "ai", ["prompt", "chat", "conversation", "conversa", "message", "mensagem", "ask", "perguntar"]),
  chatscircle: e("Chats Circle", "ai", ["dialogue", "dialogo", "thread", "multi-turn", "debate", "discussion", "discussao"]),
  binoculars: e("Binoculars", "ai", ["research", "pesquisa", "scout", "explore", "explorar", "discovery", "descoberta", "crawl"]),
  magnifyingglass: e("Magnifying Glass", "ai", ["search", "buscar", "procurar", "query", "retrieval", "lookup", "find", "filter"]),
  shieldcheck: e("Shield Check", "security", ["guardrails", "safe", "seguro", "verified", "verificado", "moderation", "moderacao", "validation", "audit"]),
  key: e("Key", "security", ["api-key", "secret", "token", "credentials", "credenciais", "access", "acesso"]),
  lock: e("Lock", "security", ["private", "privado", "encrypted", "permission", "permissao", "locked", "bloqueado"]),
  fingerprint: e("Fingerprint", "security", ["identity", "identidade", "auth", "biometric", "unique", "persona"]),
  bug: e("Bug", "dev", ["debug", "error", "erro", "issue", "vulnerability", "bounty", "exploit", "fix", "qa"]),
  listchecks: e("List Checks", "ai", ["tasks", "tarefas", "todo", "checklist", "plan-execution", "backlog"]),
  queue: e("Queue", "ai", ["queue", "fila", "jobs", "batch", "pending", "pendente", "scheduler"]),
  timer: e("Timer", "ai", ["schedule", "agendar", "cron", "timeout", "latency", "latencia", "duration", "duracao"]),
  infinity: e("Infinity", "status", ["loop", "continuous", "continuo", "autonomous-loop", "unlimited", "ilimitado", "build-learn-loop"]),
  arrowsclockwise: e("Arrows Clockwise", "status", ["sync", "refresh", "atualizar", "retry", "iterate", "iterar", "regenerate", "regenerar"]),
  pulse: e("Pulse", "status", ["health", "saude", "activity", "atividade", "live", "ao-vivo", "vitals", "monitor"]),
  play: e("Play", "status", ["run", "executar", "start", "iniciar", "resume"]),
  warning: e("Warning", "status", ["warning", "aviso", "caution", "risk", "risco", "attention", "atencao"]),
  xcircle: e("X Circle", "status", ["failed", "falhou", "rejected", "rejeitado", "cancel", "close"]),
  info: e("Info", "status", ["info", "informacao", "help", "ajuda", "about", "details", "detalhes"]),
  question: e("Question", "status", ["unknown", "desconhecido", "faq", "ask-user", "clarify", "esclarecer"]),
  steps: e("Steps", "status", ["progress", "progresso", "levels", "niveis", "onboarding", "stages", "etapas", "roadmap"]),
  // dev
  bracketscurly: e("Brackets Curly", "code", ["json", "schema", "config", "payload", "object", "yaml"]),
  gitbranch: e("Git Branch", "code", ["git", "branch", "version", "versao", "fork", "worktree"]),
  gitpullrequest: e("Git Pull Request", "code", ["pr", "review", "merge", "diff", "changes", "mudancas", "commit"]),
  rocketlaunch: e("Rocket Launch", "code", ["deploy", "launch", "lancar", "release", "ship", "publish", "publicar", "mvp"]),
  cloud: e("Cloud", "code", ["cloud", "nuvem", "cloudflare", "workers", "edge", "saas", "hosted"]),
  package: e("Package", "code", ["package", "pacote", "npm", "dependency", "bundle", "starter-kit", "template", "kit"]),
  cube: e("Cube", "code", ["component", "componente", "block", "bloco", "3d", "entity", "entidade"]),
  harddrives: e("Hard Drives", "code", ["server", "servidor", "infra", "hosting", "self-hosted", "backend"]),
  squaresfour: e("Squares Four", "code", ["dashboard", "grid", "overview", "home", "apps", "painel"]),
  layout: e("Layout", "code", ["layout", "page", "pagina", "landing", "website", "site", "ui", "wireframe"]),
  desktop: e("Desktop", "code", ["desktop", "tauri", "electron", "native", "app-desktop"]),
  devicemobile: e("Device Mobile", "code", ["mobile", "app", "ios", "android", "pwa", "responsive"]),
  faders: e("Faders", "tools", ["controls", "controlos", "mixer", "levels", "options", "opcoes"]),
  // knowledge / science
  pennib: e("Pen Nib", "language", ["writing", "escrita", "essay", "ensaio", "substack", "author", "autor", "copy"]),
  bookbookmark: e("Book Bookmark", "learning and school", ["saved", "guardado", "reading-list", "favorites", "lista-leitura"]),
  dna: e("DNA", "science", ["biology", "biologia", "genetics", "genetica", "life", "vida", "evolution", "evolucao"]),
  planet: e("Planet", "science", ["astronomy", "astronomia", "space", "espaco", "cosmos", "universe", "universo"]),
  function: e("Function", "math", ["math", "matematica", "formula", "algebra", "calculus", "calculo", "equation"]),
  columns: e("Columns", "philosophy", ["classical", "classico", "antiquity", "antiguidade", "greek", "grecia", "institution", "museum"]),
  // game
  trophy: e("Trophy", "game", ["win", "vitoria", "achievement", "conquista", "leaderboard", "ranking", "champion", "prize"]),
  medal: e("Medal", "game", ["badge", "medalha", "reward", "recompensa", "rank", "level-up", "honor"]),
  crown: e("Crown", "game", ["top", "king", "rei", "premium", "pro", "owner", "master", "mestre"]),
  castleturret: e("Castle Turret", "game", ["guild", "guilda", "fortress", "fortaleza", "base", "stronghold", "realm", "reino"]),
  gamecontroller: e("Game Controller", "game", ["game", "jogo", "gamification", "gamificacao", "play", "arcade"]),
  dicefive: e("Dice Five", "game", ["random", "aleatorio", "luck", "sorte", "roll", "chance", "surprise"]),
  hourglass: e("Hourglass", "game", ["wait", "esperar", "cooldown", "time-limit", "pending-long", "loading"]),
  // people
  user: e("User", "people", ["user", "utilizador", "profile", "perfil", "account", "conta", "me"]),
  users: e("Users", "people", ["team", "equipa", "members", "membros", "community", "comunidade", "audience", "audiencia"]),
  usersthree: e("Users Three", "people", ["guild-members", "group", "grupo", "squad", "crowd", "multiplayer", "social-game"]),
  handshake: e("Handshake", "people", ["partnership", "parceria", "deal", "acordo", "collaborate", "colaborar", "b2b"]),
  heart: e("Heart", "people", ["like", "gosto", "favorite", "favorito", "love", "wellness", "bem-estar", "spiritual"]),
  bell: e("Bell", "people", ["notification", "notificacao", "alert", "alerta", "reminder", "lembrete", "subscribe"]),
  envelope: e("Envelope", "people", ["email", "inbox", "contact", "contacto", "mail", "newsletter"]),
  // media
  image: e("Image", "media", ["image", "imagem", "photo", "foto", "picture", "generator", "gerador-imagem", "meme", "thumbnail"]),
  videocamera: e("Video Camera", "media", ["video", "record", "gravar", "youtube", "clips", "reels", "shorts"]),
  filmslate: e("Film Slate", "media", ["film", "cinema", "movie", "filme", "scene", "cena"]),
  microphone: e("Microphone", "media", ["podcast", "voice", "voz", "speech", "fala", "interview"]),
  newspaper: e("Newspaper", "media", ["news", "noticias", "article", "artigo", "blog", "newsletter", "press"]),
  megaphone: e("Megaphone", "media", ["marketing", "announce", "anunciar", "campaign", "campanha", "distribute", "distribuir"]),
  hash: e("Hash", "media", ["hashtag", "tag", "trend", "topic", "topico", "social", "niche", "nicho"]),
  // business / files
  wallet: e("Wallet", "finance", ["wallet", "carteira", "budget", "orcamento", "personal-finance", "household", "crypto"]),
  creditcard: e("Credit Card", "finance", ["payment", "pagamento", "billing", "subscription", "subscricao", "checkout", "stripe"]),
  receipt: e("Receipt", "finance", ["invoice", "fatura", "expense", "despesa", "bill", "recibo", "transactions"]),
  chartpie: e("Chart Pie", "finance", ["breakdown", "share-of", "portfolio", "portefolio", "allocation"]),
  buildings: e("Buildings", "finance", ["company", "empresa", "studio", "venture", "enterprise", "organization", "startup"]),
  briefcase: e("Briefcase", "finance", ["work", "trabalho", "business", "job", "career", "carreira", "projects"]),
  funnel: e("Funnel", "finance", ["funnel", "funil", "conversion", "conversao", "leads", "pipeline-sales"]),
  table: e("Table", "files and documents", ["table", "tabela", "spreadsheet", "csv", "rows", "dataset"]),
  link: e("Link", "files and documents", ["link", "url", "hyperlink", "ligacao", "backlink"]),
  folderopen: e("Folder Open", "files and documents", ["open-project", "browse", "repository", "repositorio"]),
  downloadsimple: e("Download Simple", "files and documents", ["download", "export", "exportar", "import", "ingest", "pull"]),
  uploadsimple: e("Upload Simple", "files and documents", ["upload", "carregar", "send", "enviar", "push", "submit"]),
};

if (INCLUDE_EXTRA_ICONS) {
  for (const [id, def] of Object.entries(EXTRA_ICONS)) {
    if (!ICONS[id]) ICONS[id] = def; // never overwrite an existing entry
  }
}

/** Ids from EXTRA_ICONS, so the adapter can be updated in one pass. */
export const EXTRA_ICON_IDS: string[] = Object.keys(EXTRA_ICONS);

/**
 * Paste-ready reminder for adapter.ts: each EXTRA_ICON_IDS key must map to the
 * Phosphor component of the same name (PascalCase), e.g.
 *   import { Robot, Cpu, TreeStructure, CastleTurret, ... } from "@phosphor-icons/react";
 *   ICON_MAP.treestructure = TreeStructure; ICON_MAP.castleturret = CastleTurret; ...
 * Then set INCLUDE_EXTRA_ICONS = true. Verify the names exist in your Phosphor version.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Original API (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// (3) Intent-based discovery for agents (additive)
// ─────────────────────────────────────────────────────────────────────────────

/** Expands a high-level concept into terms the catalog keywords understand. */
const CONCEPTS: Record<string, string[]> = {
  "agent": ["robot", "autonomous", "assistant", "executor"],
  "orchestrator": ["orchestrator", "delegation", "planner", "hierarchy"],
  "research": ["research", "explore", "discovery", "search"],
  "coding": ["code", "terminal", "git", "developer"],
  "media": ["video", "image", "podcast", "social"],
  "memory": ["memory", "context", "database", "recall"],
  "knowledge map": ["territory", "map", "graph", "atlas"],
  "quest": ["quest", "goal", "target", "mission"],
  "guild": ["guild", "group", "multiplayer", "shield"],
  "mcp": ["mcp", "connector", "integration", "plugsconnected"],
  "pipeline": ["workflow", "pipeline", "steps", "automation"],
  "generator": ["generate", "magic", "transform", "image"],
  "monetization": ["revenue", "money", "payment", "growth"],
  "audience": ["audience", "community", "social", "hashtag"],
};

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Suggest catalog ids from what the thing DOES (purpose), not its name.
 *   suggestIcons("agente que pesquisa tendências de nicho", 4)
 * `exclude` lets callers avoid icons already used in the same dock/list.
 * Only returns ids that exist in the catalog (renderable). Falls back to "sparkle".
 */
export function suggestIcons(intent: string, limit = 5, exclude: string[] = []): string[] {
  const text = fold(intent);
  const terms = new Set(text.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  for (const [concept, extra] of Object.entries(CONCEPTS)) {
    if (text.includes(concept)) extra.forEach((x) => terms.add(x));
  }
  const skip = new Set(exclude.map(normalizeIconId));
  const scored: { id: string; score: number }[] = [];
  for (const [id, def] of Object.entries(ICONS)) {
    if (skip.has(id)) continue;
    const kws = def.keywords.map((k) => fold(k).replace(/[-_]/g, ""));
    let score = 0;
    for (const raw of terms) {
      const t = raw.replace(/[-_]/g, "");
      if (id === t) score += 10;
      if (kws.includes(t)) score += 5;
      else if (t.length > 3 && kws.some((k) => k.startsWith(t) || t.startsWith(k))) score += 2;
    }
    if (score > 0) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, limit).map((s) => s.id);
  return out.length ? out : ["sparkle"];
}

/** Paste into the system prompt / search_icons tool description of the agent. */
export const ICON_SELECTION_GUIDE = `Icon selection:
1. Describe what the tab/plugin DOES (purpose), not its name. "price-monitor agent" -> monitor/observe, not "agent".
2. Use search_icons (or suggestIcons) with that purpose; pick the most specific result. Generic ones (sparkle, gear, folder) are a last resort.
3. Never repeat an icon within the same dock; pass already-used ids as exclude.
4. Keep families coherent: agents -> robot/brain/model; memory/data -> database; tools -> tools/wrench; integrations -> api/plugin; game -> target/sword/shield.
5. Only pass ids that exist in the catalog; unknown ids fall back to a random glyph.`;
