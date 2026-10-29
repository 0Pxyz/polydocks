import { platformStorage } from "@/lib/platform/storage";

const CITY_LAST_TOOL_KEY = "polymax-city-last-tool";

/**
 * The facts a one-line area description is built from. Everything shown
 * comes from real workspace data; when nothing exists the counts are the
 * description.
 */
export interface RegionFacts {
  concepts?: string[];
  sources: number;
  notes: number;
  quests: number;
  doneQuests: number;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * One-line, human-readable area description. Never placeholder prose: either
 * real concepts plus real counts, or the real (empty) counts.
 */
export function describeRegion(facts: RegionFacts): string {
  const parts: string[] = [];
  const concepts = (facts.concepts || []).filter((c) => c.trim()).slice(0, 2);
  if (concepts.length > 0) {
    parts.push(concepts.join(" · "));
  }
  const hasCounts = facts.sources > 0 || facts.notes > 0 || facts.quests > 0;
  if (hasCounts) {
    const counts: string[] = [];
    if (facts.sources > 0) counts.push(plural(facts.sources, "source"));
    if (facts.notes > 0) counts.push(plural(facts.notes, "note"));
    if (facts.quests > 0) {
      counts.push(
        facts.doneQuests >= facts.quests
          ? `${plural(facts.quests, "quest")} done`
          : `${facts.doneQuests} of ${facts.quests} quests`
      );
    }
    parts.push(counts.join(" · "));
  }
  if (parts.length === 0) {
    return "Nothing saved here yet";
  }
  if (parts.length === 1 && concepts.length > 0) {
    return `${parts[0]} · nothing saved yet`;
  }
  return parts.join(" · ");
}

/** Last-used tool per city, reopened on re-entry. First visit opens nothing. */
export function getLastCityTool(cityId: string): string | null {
  const stored = platformStorage.getItem<Record<string, string>>(CITY_LAST_TOOL_KEY);
  const toolId = stored?.[cityId];
  return typeof toolId === "string" && toolId.length > 0 ? toolId : null;
}

export function setLastCityTool(cityId: string, toolId: string): void {
  const stored = platformStorage.getItem<Record<string, string>>(CITY_LAST_TOOL_KEY) || {};
  platformStorage.setItem(CITY_LAST_TOOL_KEY, { ...stored, [cityId]: toolId });
}
