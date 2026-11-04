/**
 * Real-browser smoke test for the sandboxed plugin bridge (bridge-fix).
 *
 * Full path, in an actual Chromium iframe: seed a temp DATA_DIR with the
 * GTM App Feed plugin (same fixture + agent-tool path as
 * gtm_feed_reader.test.ts), boot the built app, open the tool through dock
 * search, click "Open in reader" on a video (assert youtube.com embed
 * in the native Reader), then on an article (assert Reader article content),
 * then prove the storage round-trip (Mark read -> reload -> still read,
 * which requires storage.set/get replies through the bridge).
 *
 * Excluded from the default `bun test` run by name (not *.test.ts) because
 * it boots a server + browser; run with `bun run test:browser`, and in CI
 * (see .github/workflows/main-check.yml) for PRs to main.
 *
 * Env knobs: SMOKE_PORT (default 3821), SMOKE_HEADLESS (default 1),
 * SMOKE_KEEP (keep server+DATA_DIR for debugging), SMOKE_BASE_URL.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SHOTS_DIR = "/tmp/polymax-audit/bridge-fix";
const PORT = Number(process.env.SMOKE_PORT || 3821);
const HEADLESS = process.env.SMOKE_HEADLESS !== "0";

async function step(name: string, fn: () => Promise<void>) {
  console.log(`[smoke] ${name} ...`);
  await fn();
  console.log(`[smoke] ok: ${name}`);
}

async function main() {
  await fs.mkdir(SHOTS_DIR, { recursive: true });

  // --- 1. Seed a temp DATA_DIR with the real GTM feed plugin ----------------
  // SMOKE_DATA_DIR + SMOKE_SEED=0 reuses an existing DATA_DIR as-is (e.g. a
  // copy of the real DB, or the Docker volume): no seeding, old compiled
  // srcdocs stay untouched, which also checks old-guest/new-host compat.
  const reuseDir = process.env.SMOKE_SEED === "0" ? process.env.SMOKE_DATA_DIR : undefined;
  const dataDir = reuseDir || (await fs.mkdtemp(path.join(os.tmpdir(), "polymax-smoke-")));
  console.log(`[smoke] DATA_DIR=${dataDir}`);
  process.env.DATA_DIR = dataDir;

  await step(reuseDir ? "verify existing DATA_DIR" : "seed gtm-app-feed via agent tools", async () => {
    const { ensureDefaultWorkspace } = await import("../../server/workspace/workspaces");
    const { readFeature } = await import("../../server/workspace/features");
    ensureDefaultWorkspace();
    const feed = await readFeature("default", "gtm-app-feed").catch(() => null);
    if (reuseDir) {
      if (!feed) throw new Error("SMOKE_DATA_DIR has no gtm-app-feed in workspace default");
      console.log(`[smoke] reusing feed (srcdoc has fix: ${feed.srcdoc.includes("__signalReady")})`);
      return;
    }
    const { create_plugin } = await import("../../server/agent/tools/create_plugin");
    const { modify_plugin } = await import("../../server/agent/tools/modify_plugin");
    const fixturePath = path.resolve(
      import.meta.dir,
      "../../server/agent/tools/gtm-feed.fixture.tsx"
    );
    const code = await fs.readFile(fixturePath, "utf-8");
    const ctx = { workspaceId: "default", step: 1 };
    const current = feed;
    if (!current) {
      const created = (await create_plugin.execute(
        {
          id: "gtm-app-feed",
          name: "GTM App Feed",
          description: "Go-to-market articles and videos with native in-app reader.",
          icon: "Rocket",
          code,
          workspaceId: "default",
        },
        ctx
      )) as any;
      if (!created.success) throw new Error(`seed create failed: ${created.error}`);
    } else if (current.code !== code) {
      const patched = (await modify_plugin.execute(
        { id: "gtm-app-feed", code, changeSummary: "smoke reseed", workspaceId: "default" },
        ctx
      )) as any;
      if (!patched.success) throw new Error(`seed patch failed: ${patched.error}`);
    }
    const check = await readFeature("default", "gtm-app-feed");
    if (!check.srcdoc.includes("__signalReady")) {
      throw new Error("seeded srcdoc predates the bridge fix (no __signalReady)");
    }
  });

  // --- 2. Boot the built app --------------------------------------------------
  // SMOKE_EXTERNAL=1 skips spawning a server (e.g. Docker flow: the app is
  // already up at SMOKE_BASE_URL with its own DATA_DIR).
  const external = process.env.SMOKE_EXTERNAL === "1";
  const distIndex = path.resolve(import.meta.dir, "../../dist/index.html");
  try {
    await fs.access(distIndex);
  } catch {
    throw new Error(`missing built frontend at ${distIndex}; run "bun run build" first`);
  }
  const server = external
    ? null
    : Bun.spawn(["bun", "server/index.ts"], {
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
  const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${PORT}`;
  const stopServer = () => {
    if (!server) return;
    try { server.kill(); } catch { /* already stopped */ }
  };
  process.on("exit", stopServer);
  try {
    await step(`wait for server at ${base}`, async () => {
      const deadline = Date.now() + 60_000;
      for (;;) {
        try {
          const res = await fetch(`${base}/api/workspaces`);
          if (res.ok) return;
        } catch { /* not up yet */ }
        if (Date.now() > deadline) throw new Error("server did not come up in 60s");
        await new Promise((r) => setTimeout(r, 500));
      }
    });

    // --- 3. Drive a real browser through the full path -------------------------
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: HEADLESS });
    try {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
      });
      // Skip first-launch onboarding deterministically.
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem("polymax_onboarding_completed_v2", "true");
        } catch { /* ignore */ }
      });
      const page = await context.newPage();
      const prefix = process.env.SMOKE_SHOT_PREFIX || "smoke";
      const shot = (name: string) => page.screenshot({ path: path.join(SHOTS_DIR, `${prefix}-${name}`) });

      await step("load app and dismiss onboarding", async () => {
        await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const skip = page.getByRole("button", { name: "Skip" });
        if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await skip.click();
        }
        await page.waitForTimeout(1500);
      });

      const openFeed = async () => {
        // Dock search (Ctrl/Cmd+Shift+P) hydrates workspace plugins and
        // lists the installed feed; open it into the sandbox iframe.
        // Scoped to the palette options: the dock bar tooltips repeat the
        // same label text (opacity-0), which a global text query matches.
        await page.keyboard.press("Control+Shift+P");
        const search = page.getByPlaceholder(/search|tools|plugins/i);
        await search.waitFor({ timeout: 15_000 });
        await search.fill("GTM App Feed");
        const row = page.getByRole("option", { name: /GTM App Feed/i }).first();
        await row.waitFor({ timeout: 15_000 });
        await row.click();
      };

      await step("open gtm-app-feed in the sandbox", async () => {
        await openFeed();
        const frame = page.frameLocator('iframe[title="GTM App Feed"], iframe[title="plugin-gtm-app-feed"]');
        await frame.getByText("Open in reader").first().waitFor({ timeout: 30_000 });
        await shot("01-feed-mounted.png");
      });

      const frame = () =>
        page.frameLocator('iframe[title="GTM App Feed"], iframe[title="plugin-gtm-app-feed"]');

      await step("video opens the native Reader embed", async () => {
        await frame().getByRole("tab", { name: "Videos" }).click();
        await frame().getByText("Open in reader").first().click();
        await page.getByRole("button", { name: /back/i }).waitFor({ timeout: 30_000 });
        const embed = page.locator('iframe[src*="youtube.com/embed"], iframe[src*="player.vimeo.com"], video');
        await embed.first().waitFor({ timeout: 30_000 });
        const src = (await embed.first().getAttribute("src")) || "";
        if (!src.includes("youtube.com/embed") && !src.includes("player.vimeo.com")) {
          throw new Error(`video did not open the expected embed (src=${src || "(video tag)"})`);
        }
        const referrer = await embed.first().getAttribute("referrerpolicy");
        if (referrer !== "strict-origin-when-cross-origin") {
          throw new Error(`embed uses wrong referrerpolicy (got ${referrer})`);
        }
        await page.waitForTimeout(3000);
        await shot("02-reader-video.png");
        await page.getByRole("button", { name: /back/i }).click();
      });

      await step("article opens the native Reader with content", async () => {
        await frame().getByRole("tab", { name: "Articles" }).click();
        const buttons = frame().getByText("Open in reader");
        const count = Math.min(await buttons.count(), 3);
        let loaded = false;
        let lastError = "";
        for (let i = 0; i < count && !loaded; i++) {
          await buttons.nth(i).click();
          try {
            await page.locator("article h1").waitFor({ timeout: 25_000 });
            const body = (await page.locator("article").innerText()).trim();
            if (body.length < 50) throw new Error("article body too short");
            loaded = true;
          } catch (e: any) {
            lastError = e?.message || String(e);
            const back = page.getByRole("button", { name: /back/i });
            if (await back.isVisible({ timeout: 5_000 }).catch(() => false)) await back.click();
            await page.waitForTimeout(1000);
          }
        }
        if (!loaded) throw new Error(`no article body rendered: ${lastError}`);
        await shot("03-reader-article.png");
        await page.getByRole("button", { name: /back/i }).click();
      });

      await step("storage round-trip survives reload (bridge replies live)", async () => {
        await frame().getByRole("tab", { name: "Articles" }).click();
        const markRead = frame().getByRole("button", { name: "Mark read" }).first();
        await markRead.waitFor({ timeout: 15_000 });
        await markRead.click();
        await frame().getByRole("button", { name: "Mark unread" }).first().waitFor({ timeout: 15_000 });
        await page.reload({ waitUntil: "domcontentloaded" });
        const skip = page.getByRole("button", { name: "Skip" });
        if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
        // The dock restores the open tool on boot; only reopen when the
        // restore did not bring the sandbox back (reopening would toggle).
        const feedFrame = page.locator('iframe[title="GTM App Feed"], iframe[title="plugin-gtm-app-feed"]');
        try {
          await feedFrame.first().waitFor({ state: "attached", timeout: 10_000 });
        } catch {
          await openFeed();
        }
        await frame().getByRole("tab", { name: "Articles" }).click();
        await frame().getByRole("button", { name: "Mark unread" }).first().waitFor({ timeout: 20_000 });
        await shot("04-still-read-after-reload.png");
      });

      await step("close the tab (dock toggle unmounts the sandbox)", async () => {
        const dockBtn = page.locator('[data-dock-tool-id="gtm-app-feed"]');
        if (await dockBtn.count()) {
          await dockBtn.first().click();
        } else {
          // Fallback: dock search lists it as Open; selecting again toggles closed.
          await openFeed();
        }
        await page.locator('iframe[title="GTM App Feed"], iframe[title="plugin-gtm-app-feed"]').waitFor({ state: "detached", timeout: 15_000 });
        await shot("05-tab-closed.png");
      });

      await browser.close();
    } finally {
      if (process.env.SMOKE_KEEP) {
        console.log(`[smoke] SMOKE_KEEP set: server left running at ${base}, DATA_DIR=${dataDir}`);
        process.removeListener("exit", stopServer);
      } else {
        stopServer();
        if (!reuseDir && !external) await fs.rm(dataDir, { recursive: true, force: true });
      }
    }
    console.log("[smoke] ALL GREEN");
    // Explicit exit: the spawned server/browser child handles can keep the
    // event loop alive after a green run, hanging CI until timeout.
    // (SMOKE_KEEP still leaves the server up for local debugging.)
    if (!process.env.SMOKE_KEEP) process.exit(0);
  } catch (err) {
    stopServer();
    throw err;
  }
}

main().catch((err) => {
  console.error(`[smoke] FAILED: ${err?.message || err}`);
  process.exit(1);
});
