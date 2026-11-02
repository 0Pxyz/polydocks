/**
 * Anti-slop validator for generated plugin code.
 * Mirrors the Design section of server/agent/skills/plugins.md:
 * theme tokens only, no hardcoded colors, no gradients, no external
 * sources (the sandbox CSP forbids them anyway). Runs on create, edit
 * (when code is supplied) and publish (stored code). Fails closed on
 * hard violations; style smells (Badge/Pill/Card, explicit borders)
 * are warnings — the skill, not the gate, teaches taste.
 */

import { validateKitUsage } from "./kitValidator";

const ALLOWED_HEX = new Set([
  "c8ff57", // --accent-lime, the single accent
  "f7931a", "F7931A", // Bitcoin brand orange (asset color, not decoration)
  "0a0a0c", "0A0A0C",
  "ffffff", "fff", "FFFFFF",
  "000000", "000",
]);

export interface SlopReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * @param strict - agent-created plugins fail closed on structural slop
 * (Badge/Card/bordered boxes). Legacy first-party code only gets warnings.
 */
export function validateSlop(code: string, opts?: { strict?: boolean }): SlopReport {
  const strict = opts?.strict ?? false;
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

  // Kit v2 hard gate (strict = agent-created): raw form elements, inline
  // styles and missing kit usage fail closed with a fixable report.
  if (strict) {
    const report = validateKitUsage(src);
    if (!report.ok) {
      for (const e of report.errors) errors.push(e);
    }
  }

  if (/linear-gradient|radial-gradient|conic-gradient/i.test(src)) {
    errors.push("gradients: flat surfaces in theme tokens, no gradient washes");
  }

  // Opaque static boxes: Tailwind named scales (bg-black, bg-white,
  // bg-zinc-*, bg-neutral-*, bg-slate-*, bg-gray-*, bg-stone-*, with optional
  // /opacity) and background(-color): black|white. Surfaces must inherit
  // theme tokens (bg-card, bg-muted, bg-background) so a theme switch
  // reflects instantly; transparent is not a background.
  const opaqueBg =
    src.match(/\bbg-(?:black|white|zinc-\d+|neutral-\d+|slate-\d+|gray-\d+|stone-\d+)(?:\/[\d.]+|\/\[[\d.]+\])?(?![\w-])/g) ??
    [];
  const opaqueStyle = src.match(/background(?:-color)?\s*:\s*(?:black|white)\b/gi) ?? [];
  const opaqueHits = [...opaqueBg, ...opaqueStyle];
  if (opaqueHits.length > 0) {
    const msg = `opaque static background(s) (${opaqueHits.slice(0, 4).join(", ")}): use theme tokens (bg-card, bg-muted, bg-background), never fixed fills`;
    if (strict) errors.push(msg);
    else warnings.push(msg);
  }

  if (/@import\s+url\(|@import\s+["']https?:|<link[^>]+stylesheet|url\(\s*["']?https?:/i.test(src)) {
    errors.push("external sources: no remote stylesheets, fonts or images; the sandbox CSP blocks them");
  }

  if (/<(Badge|Pill)\b/.test(src)) {
    // Kit Badge is the one legitimate pill: binary live state (Live/Paused).
    // Decorative status pills stay banned, but that is a taste warning, not
    // a gate — the Design section teaches when a badge earns its place.
    warnings.push("Badge/Pill components: state as plain text or one live badge, never decorative chips");
  }
  if (/<Card[\s>]/.test(src)) {
    const msg = "Card containers: group content on a subtle surface step (px-group / bg-card) instead of boxing it";
    if (strict) errors.push(msg);
    else warnings.push(msg);
  }
  const borderDecls = src.match(/border\s*:\s*1px solid[^;}]*[;}]/g) ?? [];
  if (borderDecls.length > 0) {
    const msg = `${borderDecls.length} explicit bordered box(es): prefer a subtle surface step, no outline borders`;
    if (strict) errors.push(msg);
    else warnings.push(msg);
  }

  return { ok: errors.length === 0, errors, warnings };
}
