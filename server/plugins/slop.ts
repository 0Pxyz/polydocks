/**
 * Anti-slop validator for generated plugin code.
 * Mirrors the Design section of server/agent/skills/plugins.md:
 * theme tokens only, no hardcoded colors, no gradients, no external
 * sources (the sandbox CSP forbids them anyway). Runs on create, edit
 * (when code is supplied) and publish (stored code). Fails closed on
 * hard violations; style smells (Badge/Pill/Card, explicit borders)
 * are warnings — the skill, not the gate, teaches taste.
 */

const ALLOWED_HEX = new Set([
  "c8ff57", // --accent-lime, the single accent
  "0a0a0c", "0A0A0C",
  "ffffff", "fff", "FFFFFF",
  "000000", "000",
]);

export interface SlopReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSlop(code: string): SlopReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const src = code || "";

  const hexes = new Set<string>();
  for (const m of src.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    if (!ALLOWED_HEX.has(m[1])) hexes.add(`#${m[1]}`);
  }
  if (hexes.size > 0) {
    errors.push(
      `hardcoded colors (${[...hexes].slice(0, 6).join(", ")}): use theme tokens (var(--...)), never literal colors`
    );
  }

  if (/linear-gradient|radial-gradient|conic-gradient/i.test(src)) {
    errors.push("gradients: flat surfaces in theme tokens, no gradient washes");
  }

  if (/@import\s+url\(|@import\s+["']https?:|<link[^>]+stylesheet|url\(\s*["']?https?:/i.test(src)) {
    errors.push("external sources: no remote stylesheets, fonts or images; the sandbox CSP blocks them");
  }

  if (/<(Badge|Pill)\b/.test(src)) {
    warnings.push("Badge/Pill components: state as plain text, never decorative chips");
  }
  if (/<Card[\s>]/.test(src)) {
    warnings.push("Card containers: let content breathe on the surface instead of boxing it");
  }
  const borderDecls = src.match(/border\s*:\s*1px solid[^;}]*[;}]/g) ?? [];
  if (borderDecls.length > 0) {
    warnings.push(`${borderDecls.length} explicit bordered box(es): prefer a subtle surface step, no outline borders`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
