/**
 * Kit v2 static gate: raw elements, hardcoded colors, inline styles.
 * Fails closed with a fixable report (max 2 agent retries — the caller
 * enforces the retry budget; this module only reports).
 */
export interface KitReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const RAW_ELEMENTS: Array<{ re: RegExp; fix: string }> = [
  { re: /<button[\s>]/, fix: "raw <button>: use kit Button or IconButton (whole-row ListRow for list opens)" },
  { re: /<input[\s>]/, fix: "raw <input>: use TextField, SearchField, Checkbox or Switch" },
  { re: /<select[\s>]/, fix: "raw <select>: use kit Select or SegmentedControl" },
  { re: /<textarea[\s>]/, fix: "raw <textarea>: use TextAreaField" },
  { re: /style\s*=\s*\{\{/, fix: "inline style={{…}}: use kit layout props (Stack gap) and theme-token classes" },
  { re: /style\s*=\s*["']/, fix: 'inline style="…": use kit components and theme tokens' },
];

export function findRawElements(code: string): string[] {
  const src = code || "";
  // Ignore kit-internal implementation files: they define the primitives.
  if (src.includes("Plugin UI Kit v2")) return [];
  const hits: string[] = [];
  // Strip kit import lines so the allowlist itself never counts.
  const body = src.replace(/^import\s+[^;]*from\s+["'][^"']*["'];?\s*$/gm, "");
  for (const { re, fix } of RAW_ELEMENTS) {
    if (re.test(body)) hits.push(fix);
  }
  return hits;
}

export function findKitHex(code: string): string[] {
  const found = new Set<string>();
  for (const m of (code || "").matchAll(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
    found.add(m[0]);
  }
  return [...found];
}

const KIT_IDENTIFIERS = [
  "Stack", "Inline", "Grid", "Panel", "Section", "Scroll", "Spacer",
  "Heading", "Text", "Caption", "Mono", "Metric",
  "Button", "IconButton", "Link",
  "TextField", "SearchField", "TextAreaField", "Select", "Checkbox", "Switch", "SegmentedControl",
  "Tabs", "TabsList", "TabsTrigger",
  "List", "ListRow", "Card", "Avatar", "Progress", "ProgressBar", "Spinner",
  "EmptyState", "InlineMessage", "Dialog", "Tooltip", "Skeleton",
  "ListWithSearch", "ListDetail", "MetricsPanel", "FormPanel", "ReaderFeed", "NotesEditor",
  "SettingsForm", "SingleAction", "StateScreen",
];

export function usesKitComponents(code: string): boolean {
  return KIT_IDENTIFIERS.some((id) => new RegExp(`<${id}[\\s/>]`).test(code || ""));
}

export function validateKitUsage(code: string): KitReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const src = code || "";

  for (const hit of findRawElements(src)) errors.push(hit);
  for (const hex of findKitHex(src)) {
    errors.push(`hardcoded color ${hex}: use theme tokens (var(--background), var(--primary), …)`);
  }
  // The no-kit rule targets React guest code (import-bearing). Vanilla
  // plain-script plugins (no imports, .px-* contract in features.ts) stay
  // valid so existing wagons keep rolling; the skill still steers the
  // agent to the kit first.
  const isReact = /^\s*import\s/m.test(src);
  if (isReact && !usesKitComponents(src)) {
    errors.push(
      "no kit components detected: compose the UI from the kit catalog (call ui_catalog, pick Level 1 parts and patterns) instead of raw HTML/CSS",
    );
  }
  if (usesKitComponents(src) && /className="[^"]*#[0-9a-fA-F]{3,6}/.test(src)) {
    warnings.push("hex inside className: move to a theme token");
  }
  return { ok: errors.length === 0, errors, warnings };
}
