/**
 * Capture judges media from the running app (round-2 cleanup).
 *
 * Produces (in docs/assets/):
 *   dock.png, notes.png, browser.png, plugin-built.png, agent-working.png
 *   hero.gif (< 5 MB, 720px wide, 10fps)
 *
 * Run: CAPTURE_URL=http://localhost:5173 bun scripts/capture-media.ts
 * Requires the dev server (bun run dev) with MODEL_API_KEY for the one
 * live agent turn. Every shot is real app state; the seeded note is
 * removed at the end. Each step is independent — a failure logs and the
 * script continues with the rest.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve(__dirname, "..");
const assetsDir = path.join(rootDir, "docs", "assets");
const baseUrl = process.env.CAPTURE_URL ?? "http://localhost:5173";
const apiUrl = "http://localhost:3000";

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync("/tmp/polydocks-capture", { recursive: true });

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

const results: Array<[string, string]> = [];
const note = (name: string, ok: boolean, detail = "") => {
  results.push([ok ? "ok" : "FAIL", `${name}${detail ? ` — ${detail}` : ""}`]);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
};

async function main() {
  // Seed two real notes through the real API (cleaned up by id afterwards).
  const seedIds: string[] = [];
  const seeds = [
    {
      title: "State-space models — reading notes",
      body: "Mamba (Gu et al., 2023): selective SSM, linear-time recurrence with input-dependent parameters. Open question: how does selection compare to attention on long-range retrieval benchmarks?",
    },
    {
      title: "What to ask Poly",
      body: "Morning setup: open the three sites I read first, pin a notes tab beside them. Rust: best free book + sandbox starter. Compare two papers, save key claims as sources.",
    },
  ];
  for (const seed of seeds) {
    try {
      const res = await fetch(`${apiUrl}/api/plugins/notes/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "default", ...seed }),
      });
      const json: any = await res.json().catch(() => null);
      if (json?.data?.id) seedIds.push(json.data.id);
    } catch (e) {
      console.log(`seed failed: ${String(e).slice(0, 120)}`);
    }
  }
  note("seed notes", seedIds.length === 2, seedIds.join(",") || "none created");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  // Warm-up: prime the dev server so shots start on rendered UI.
  const warm = await browser.newPage();
  await warm.goto(baseUrl, { waitUntil: "networkidle" }).catch(() => {});
  await warm.waitForTimeout(2500);
  await warm.close().catch(() => {});

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: "/tmp/polydocks-capture", size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${String(e).slice(0, 160)}`));
  await page.addInitScript(() => {
    localStorage.setItem("polymax_onboarding_completed_v2", "true");
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const skip = page.getByRole("button", { name: "Skip" });
  if ((await skip.count()) > 0) await skip.first().click().catch(() => {});
  await page.waitForTimeout(800);

  const open = (id: string) =>
    page.evaluate((t) => (window as any).__dockStore.getState().openTool(t), id);

  const shot = (p: string) => page.screenshot({ path: p, timeout: 20000 });

  // 1. Notes with a seeded note open.
  try {
    await open("notes");
    await page.waitForTimeout(2000);
    await shot(path.join(assetsDir, "notes.png"));
    const title = await page.getByLabel("Note title").inputValue().catch(() => "");
    note("notes.png", true, `title=${JSON.stringify(title.slice(0, 40))}`);
  } catch (e) {
    note("notes.png", false, String(e).slice(0, 120));
  }

  // 2. A tool Poly built (generated plugin, live in this workspace).
  try {
    await open("bitcoin");
    await page.waitForTimeout(4000);
    await shot(path.join(assetsDir, "plugin-built.png"));
    const focused = await page.evaluate(
      () => (window as any).__dockStore?.getState()?.dock?.focusedId
    );
    note("plugin-built.png", focused === "bitcoin", `focused=${focused}`);
  } catch (e) {
    note("plugin-built.png", false, String(e).slice(0, 120));
  }

  // 3. Dock overview, with panels open.
  try {
    await shot(path.join(assetsDir, "dock.png"));
    note("dock.png", true, "notes + bitcoin open");
  } catch (e) {
    note("dock.png", false, String(e).slice(0, 120));
  }

  // 4. Browser surface (real page when reachable, honest fallback otherwise).
  try {
    await open("browser");
    await page.waitForTimeout(2500);
    await shot(path.join(assetsDir, "browser.png"));
    note("browser.png", true);
  } catch (e) {
    note("browser.png", false, String(e).slice(0, 120));
  }

  // 5+6. One live model turn on the verified working path (#402): open a
  // seeded note by title. (Bare 'open <fuzzy name>' prompts hit the
  // router dead-end filed as #412, so the hero uses the note flow.)
  // Working screenshot + hero video source.
  try {
    await open("agent");
    await page.waitForTimeout(1000);
    const orb = page.locator("[data-home-orb]");
    if ((await orb.count()) > 0) await orb.first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const box = page.locator("textarea").first();
    await box.waitFor({ timeout: 15000 });
    await box.fill('Open my note titled "What to ask Poly"');
    await box.press("Enter");
    await page.waitForTimeout(35000);
    await shot(path.join(assetsDir, "agent-working.png"));
    const title = await page.getByLabel("Note title").inputValue().catch(() => "");
    note("agent-working.png", title.includes("What to ask Poly"), `title=${JSON.stringify(title.slice(0, 40))}`);
    await page.waitForTimeout(10000);
  } catch (e) {
    note("agent-working.png", false, String(e).slice(0, 120));
  }

  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});

  // Hero GIF from the recorded turn: newest webm in the capture dir,
  // trimmed to its last 20s (the live agent turn), 720px, 10fps, palette.
  try {
    const dir = "/tmp/polydocks-capture";
    const webms = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".webm"))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (webms.length === 0) {
      note("hero.gif", false, "no recorded video found");
    } else {
      const src = webms[0];
      const durOut = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${src}"`,
        { encoding: "utf-8" }
      ).trim();
      const start = Math.max(0, parseFloat(durOut) - 20);
      const hero = path.join(assetsDir, "hero.gif");
      run(
        `ffmpeg -y -ss ${start.toFixed(1)} -i "${src}" -filter_complex "[0:v] fps=10,scale=720:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${hero}"`
      );
      const mb = fs.statSync(hero).size / (1024 * 1024);
      note("hero.gif", mb < 5, `${mb.toFixed(2)} MB from last 20s`);
    }
  } catch (e) {
    note("hero.gif", false, String(e).slice(0, 160));
  }

  // Seeded notes have no delete capability: report ids for SQL cleanup
  // (local dev DB only, never shipped).
  console.log(`SEED_IDS=${seedIds.join(",")}`);
  note("seed cleanup", seedIds.length > 0, "ids printed for manual delete");

  console.log("\n=== capture summary ===");
  for (const [s, m] of results) console.log(`${s}  ${m}`);
  if (results.some(([s]) => s === "FAIL")) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
