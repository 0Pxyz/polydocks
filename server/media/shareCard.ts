import { z } from "zod";
import { generateImage } from "./image";
import { imageBudget, refundImageSpend, reserveImageSpend } from "./budget";
import { config } from "../config";

export const ShareCardInput = z.object({
  city: z.string().min(1).max(80).describe("City title shown on the card"),
  region: z.string().max(80).optional().describe("Region line under the city"),
  level: z.number().int().min(1).max(99).optional().describe("Explorer level"),
  xp: z.number().int().min(0).optional().describe("Total XP"),
  streak: z.number().int().min(0).optional().describe("Day streak"),
});

export type ShareCardInput = z.infer<typeof ShareCardInput>;

export interface ShareCardResult {
  ok: boolean;
  url?: string;
  model?: string;
  bytes?: number;
  cached?: boolean;
  code?: string;
  error?: string;
  retryable?: boolean;
}

export function buildShareCardPrompt(input: ShareCardInput): string {
  const bits: string[] = [input.city];
  if (input.region) bits.push(input.region);
  const stats: string[] = [];
  if (typeof input.level === "number") stats.push(`level ${input.level}`);
  if (typeof input.xp === "number") stats.push(`${input.xp} XP`);
  if (typeof input.streak === "number" && input.streak > 0) stats.push(`${input.streak}-day streak`);
  const statLine = stats.length > 0 ? ` Explorer stats: ${stats.join(" · ")}.` : "";
  return (
    `Premium dark share card background art for a learning milestone, no text, no letters, no watermark: ` +
    `theme of "${bits.join(" — ")}".${statLine} Abstract topographic map lines and glowing city lights, ` +
    `charcoal background with a single lime-green accent, generous empty space in the center for overlay text. ` +
    `Minimal, celebratory, 16:9 composition.`
  ).slice(0, 900);
}

/**
 * Generate an exportable share-card background. Text (city, XP, streak)
 * is rendered by the client on top — the model only paints the backdrop,
 * which keeps stats exact and avoids garbled model text.
 */
export async function requestShareCard(input: ShareCardInput): Promise<ShareCardResult> {
  const parsed = ShareCardInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      retryable: false,
    };
  }
  if (!config.MODEL_API_KEY?.trim()) {
    return { ok: false, code: "image_not_configured", error: "Muse Image is not configured.", retryable: false };
  }
  if (imageBudget().remaining <= 0 || !reserveImageSpend()) {
    return { ok: false, code: "budget_exceeded", error: "Daily image budget reached. Try again tomorrow.", retryable: false };
  }
  const result = await generateImage({
    prompt: buildShareCardPrompt(parsed.data),
    size: "1536x1024",
    outputFormat: "webp",
  });
  if (!result.ok) {
    refundImageSpend();
    return result;
  }
  return { ok: true, url: result.url, model: result.model, bytes: result.bytes, cached: result.cached };
}
