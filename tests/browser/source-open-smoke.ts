/**
 * Source-open validation smoke (not a *.test.ts: excluded from `bun test`).
 *
 * Boots the built app against a COPY of the real DB, enters the TikTok
 * city, opens 3 real YouTube videos from its feed inside the app, and
 * asserts the player contract: youtube.com/embed src, strict-origin
 * referrer, no overlay over the chat, no disabled-embed fallback.
 * Screenshots land in /tmp/polymax-audit/source-open for human playback
 * confirmation. Also captures the side-chat+dock layout for the overflow
 * diagnosis.
 *
 * Run: bun run build && bun tests/browser/source-open-smoke.ts
 * Env: SMOKE_PORT (default 3823), SMOKE_HEADLESS (default 1),
 *      SMOKE_DB (default /tmp/opencode/smoke-db).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SHOTS_DIR = "/tmp/polymax-audit/source-open";
const PORT = Number(process.env.SMOKE_PORT || 3823);
const HEADLESS = process.env.SMOKE_HEADLESS !== "0";

async function step(name: string, fn: () => Promise<void>) {
  console.log(`[smoke] ${name} ...`);
  await fn();
  console.log(`[smoke] ok: ${name}`);
}

const VIDEOS = [
  { id: "8WVthsOAJgM", title: "TikTok Monolith" },
  { id: "nfczi2cI6Cs", title: "How TikTok's Algorithm Figures You Out" },
  { id: "Gscelu22FWI", title: "Design TikTok's Recommendation System" },
];

// Owner-disabled embed: must show thumbnail + single out-of-app action,
// never the YouTube error screen.
const DISABLED_VIDEO = { id: "skZ1HcF7AsM", title: "Build TikTok's Personalized" };

async function main() {
  await fs.mkdir(SHOTS_DIR, { recursive: true });
  const dataDir = process.env.SMOKE_DB || "/tmp/opencode/smoke-db";

  const server = Bun.spawn(["bun", "server/index.ts"], {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(PORT),
      NODE_ENV: "production",
      SERVE_STATIC: "true",
      MODEL_API_KEY: process.env.MODEL_API_KEY || "dummy-meta-key-unconfigured",
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  const base = `http://127.0.0.1:${PORT}`;
  process.on("exit", () => { try { server.kill(); } catch { /* noop */ } });
  try {
    await step(`wait for server at ${base}`, async () => {
      const deadline = Date.now() + 60_000;
      for (;;) {
        try {
          const res = await fetch(`${base}/api/health`);
          if (res.ok) return;
        } catch { /* not up yet */ }
        if (Date.now() > deadline) throw new Error("server did not come up in 60s");
        await new Promise((r) => setTimeout(r, 500));
      }
    });

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: HEADLESS });
    try {
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const CITY = "city-tiktok-recommendation-systems-foundations";
      await context.addInitScript((city: string) => {
        try {
          window.localStorage.setItem("polymax_onboarding_completed_v1", "true");
          // Reopen the last-used tool: Sources.
          window.localStorage.setItem("polymax-city-last-tool", JSON.stringify({ [city]: "sources" }));
        } catch { /* noop */ }
      }, CITY);
      const page = await context.newPage();
      const shot = (name: string) => page.screenshot({ path: path.join(SHOTS_DIR, name) });

      await step("load app straight into the TikTok city (?city= deep link)", async () => {
        await page.goto(`${base}/?city=city-tiktok-recommendation-systems-foundations`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const skip = page.getByRole("button", { name: "Skip" });
        if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
        await page.getByText("Research & Sources").waitFor({ timeout: 20_000 });
        await page.waitForTimeout(1200);
        await shot("10-feed.png");
      });

      for (const [i, v] of VIDEOS.entries()) {
        await step(`open video ${i + 1}/3 (${v.id})`, async () => {
          const card = page.locator("button", { hasText: v.title }).first();
          await card.waitFor({ timeout: 15_000 });
          await card.scrollIntoViewIfNeeded().catch(() => undefined);
          await card.click();
          await page.getByText("Voltar ao feed").waitFor({ timeout: 15_000 });
          const frame = page.locator(`iframe[src*="youtube.com/embed/${v.id}"]`);
          await frame.waitFor({ timeout: 20_000 });
          const referrer = await frame.getAttribute("referrerpolicy");
          if (referrer !== "strict-origin-when-cross-origin") {
            throw new Error(`wrong referrerpolicy on ${v.id}: ${referrer}`);
          }
          // Give the player + IFrame API time to report disabled embeds.
          await page.waitForTimeout(9000);
          const fallback = page.getByRole("link", { name: "Ver no YouTube" });
          if (await fallback.isVisible().catch(() => false)) {
            throw new Error(`disabled-embed fallback shown for ${v.id}`);
          }
          await shot(`20-video-${i + 1}-${v.id}.png`);
          await page.getByText("Voltar ao feed").click();
          await page.getByText("Research & Sources").waitFor({ timeout: 15_000 });
        });
      }

      await step(`disabled-embed video shows thumbnail + out-of-app action (${DISABLED_VIDEO.id})`, async () => {
        const card = page.locator("button", { hasText: DISABLED_VIDEO.title }).first();
        await card.waitFor({ timeout: 15_000 });
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        await card.click();
        await page.getByText("Voltar ao feed").waitFor({ timeout: 15_000 });
        const fallback = page.getByRole("link", { name: "Ver no YouTube" });
        await fallback.waitFor({ timeout: 25_000 });
        // No embedded player for a disabled video: no iframe, no error text.
        if (await page.locator(`iframe[src*="youtube.com/embed/${DISABLED_VIDEO.id}"]`).count() > 0) {
          throw new Error(`player iframe still mounted for disabled video ${DISABLED_VIDEO.id}`);
        }
        await shot(`21-video-disabled-${DISABLED_VIDEO.id}.png`);
        await page.getByText("Voltar ao feed").click();
        await page.getByText("Research & Sources").waitFor({ timeout: 15_000 });
      });

      await step("side-chat + dock overflow diagnosis", async () => {
        await page.locator('[data-dock-tool-id="agent"]').click();
        await page.waitForTimeout(1500);
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        console.log(`[smoke] horizontal overflow px: ${overflowX}`);
        if (overflowX > 1) throw new Error(`page overflows horizontally by ${overflowX}px with side chat open`);
        await shot("30-side-chat.png");
      });
    } finally {
      await browser.close();
    }
  } finally {
    try { server.kill(); } catch { /* noop */ }
  }
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err?.message || err);
  process.exit(1);
});
