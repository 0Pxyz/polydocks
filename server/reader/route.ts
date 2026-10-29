import { Hono } from "hono";
import { loadReaderContent } from "./service";

export const readerRouter = new Hono();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_MAX;
}

/**
 * GET /api/reader?url= — native Reader backend. http(s) only, SSRF-guarded,
 * size-capped (1.5 MB), rate-limited (30/min per IP), cached.
 */
readerRouter.get("/", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) {
    return c.json({ success: false, error: "Reader rate limit exceeded (30/min)" }, 429);
  }

  const url = c.req.query("url");
  if (!url || typeof url !== "string") {
    return c.json({ success: false, error: "Missing required query param: url" }, 400);
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return c.json({ success: false, error: "Only http(s) URLs are permitted" }, 400);
  }

  try {
    const content = await loadReaderContent(url);
    return c.json({ success: true, ...content });
  } catch (err: any) {
    const message = err?.message || "Failed to load reader content";
    const blocked = /blocked|forbidden|private|metadata|SSRF/i.test(message);
    return c.json({ success: false, error: message }, blocked ? 400 : 502);
  }
});
