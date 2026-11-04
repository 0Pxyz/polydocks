/**
 * Full demo capture (12 scenes) for the judges video + photos.
 *
 * Run: CAPTURE_URL=http://localhost:5173 bun scripts/capture-demo.ts
 * Output: /tmp/polydocks-demo/ (shots + full-session webm + scene log).
 * Assets are curated into docs/assets/ afterwards by hand.
 *
 * Requires the dev server (bun run dev). Uses live model turns.
 * An auto-approver resolves pending approvals as allow_once after ~8s
 * (so approval cards are visible on video, then the turn continues).
 * Every scene is independent: a failure is logged and the run continues.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = path.resolve(__dirname, "..");
const outDir = "/tmp/polydocks-demo";
const baseUrl = process.env.CAPTURE_URL ?? "http://localhost:5173";
const apiUrl = "http://localhost:3000";
const headers = { "Content-Type": "application/json", "X-Polydocks-User": "local" };

fs.mkdirSync(outDir, { recursive: true });

type Result = [string, string];
const results: Result[] = [];
const sceneLog: Array<{ scene: string; at: number }> = [];
const t0 = Date.now();
const stamp = () => Math.round((Date.now() - t0) / 1000);

function note(ok: boolean, name: string, detail = "") {
  results.push([ok ? "ok" : "FAIL", `${name}${detail ? ` — ${detail}` : ""}`]);
  console.log(`${ok ? "✓" : "✗"} [${stamp()}s] ${name}${detail ? `: ${detail}` : ""}`);
}
function scene(name: string) {
  sceneLog.push({ scene: name, at: stamp() });
  console.log(`\n===== [${stamp()}s] SCENE: ${name} =====`);
}

async function api<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json().catch(() => null)) as T;
}

async function lastSeq(): Promise<number> {
  const t: any = await api("GET", "/api/agent/thread?limit=1");
  const msgs = t?.messages ?? [];
  return msgs.length ? Number(msgs[msgs.length - 1].seq ?? 0) : 0;
}

/** Wait for a new terminal message after `since` (done or error). */
async function waitForTurn(since: number, timeoutMs: number, label: string): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const t: any = await api("GET", "/api/agent/thread?limit=6");
      for (const m of t?.messages ?? []) {
        if (Number(m.seq) > since && (m.role === "assistant" || m.role === "error")) {
          const txt = String(m.content ?? m.text ?? "").slice(0, 120).replace(/\n+/g, " ");
          console.log(`  turn update [${stamp()}s]: ${m.role}: ${txt}`);
          if (m.role === "error") return false;
          // Assistant messages stream; consider the turn settled when no
          // new message arrives for 25s.
          const settled = await settleCheck(since, 25000);
          console.log(`  turn settled [${stamp()}s] (${label})`);
          return settled;
        }
      }
    } catch (e) {
      console.log(`  poll error: ${String(e).slice(0, 100)}`);
    }
  }
  console.log(`  TIMEOUT waiting for turn (${label})`);
  return false;
}

async function settleCheck(since: number, quietMs: number): Promise<boolean> {
  let last = await lastSeq();
  const end = Date.now() + 6 * 60 * 1000;
  let quietSince = Date.now();
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 5000));
    const now = await lastSeq().catch(() => last);
    if (now !== last) {
      last = now;
      quietSince = Date.now();
    } else if (Date.now() - quietSince > quietMs) {
      return true;
    }
  }
  return false;
}

/** Auto-approver: allow_once anything pending older than ~8s. */
function startApprover(): () => void {
  const seen = new Map<string, number>();
  const iv = setInterval(async () => {
    try {
      const list: any = await api("GET", "/api/agent/approvals");
      const items = list?.data ?? list?.approvals ?? [];
      for (const a of items) {
        const id = String(a.id ?? "");
        if (!id || a.status !== "pending") continue;
        if (!seen.has(id)) {
          seen.set(id, Date.now());
          console.log(`  approval pending [${stamp()}s]: ${id} ${String(a.summary ?? a.title ?? "").slice(0, 80)}`);
          continue;
        }
        if (Date.now() - seen.get(id)! > 8000) {
          seen.delete(id);
          await api("POST", `/api/agent/approvals/${id}`, { decision: "allow_once" });
          console.log(`  approval allowed [${stamp()}s]: ${id}`);
        }
      }
    } catch {}
  }, 3000);
  return () => clearInterval(iv);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const warm = await browser.newPage();
  await warm.goto(baseUrl, { waitUntil: "networkidle" }).catch(() => {});
  await warm.waitForTimeout(2500);
  await warm.close().catch(() => {});

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e: any) => console.log(`[pageerror] ${String(e).slice(0, 140)}`));
  await page.addInitScript(() => {
    localStorage.setItem("polydocks_onboarding_completed_v2", "true");
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const skip = page.getByRole("button", { name: "Skip" });
  if ((await skip.count()) > 0) await skip.first().click().catch(() => {});
  await page.waitForTimeout(800);

  const stopApprover = startApprover();
  const shot = (name: string) =>
    page.screenshot({ path: path.join(outDir, name), timeout: 20000 });
  const open = (id: string) =>
    page.evaluate((t) => (window as any).__dockStore.getState().openTool(t), id);

  async function ask(prompt: string, waitMs: number, label: string): Promise<boolean> {
    const since = await lastSeq().catch(() => 0);
    const orb = page.locator("[data-home-orb]");
    if ((await orb.count()) > 0) await orb.first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const box = page.locator("textarea").first();
    await box.waitFor({ timeout: 15000 });
    await box.fill(prompt);
    await box.press("Enter");
    console.log(`  sent [${stamp()}s] (${label}): ${prompt.slice(0, 90)}`);
    return waitForTurn(since, waitMs, label);
  }

  try {
    // 1. Home + dock.
    scene("01 home + dock");
    await shot("01-home-dock.png");
    note(true, "01 home + dock");

    // 2. Theme + GIF background.
    scene("02 theme + background");
    const ok2 = await ask(
      "Change my workspace theme to something that complements this background, and add this GIF as my workspace background:\n\nhttps://raw.githubusercontent.com/rachelvansciver/SpinningASCIIDonut/master/spinningdonut.gif\n\nMake sure the theme and background work well together.",
      8 * 60 * 1000,
      "theme"
    );
    await page.waitForTimeout(2000);
    await shot("02-theme.png");
    note(ok2, "02 theme + background");

    // 3. Research.
    scene("03 research");
    const ok3 = await ask(
      "Research the latest developments in AI agents, autonomous workflows, and new AI-powered developer tools. Search the web for interesting articles, blog posts, YouTube videos, and relevant resources. Don't just give me a summary in chat. Use TinyFish to discover and collect relevant content from across the web, then organize everything into a visual feed inside my workspace. Create a clean, browsable experience where I can explore the sources, read articles, and watch videos. Use an appropriate existing Reader or View plugin if available, or create a new one if needed. Prioritize quality and relevance over quantity. Include source links and short descriptions for each item.",
      12 * 60 * 1000,
      "research"
    );
    await shot("03-research-feed.png");
    note(ok3, "03 research feed");
    try {
      await open("browser");
      await page.waitForTimeout(2000);
      await shot("03b-reader.png");
      note(true, "03b reader");
    } catch (e) {
      note(false, "03b reader", String(e).slice(0, 120));
    }

    // 4. Box Breathing.
    scene("04 box breathing");
    const ok4 = await ask(
      'Build me a breathing exercise plugin: a circle that expands and contracts on a 4-4-4-4 box breathing cycle with start/pause, round counter, and a calm dark design. Call it "Box Breathing".',
      12 * 60 * 1000,
      "box-breathing"
    );
    await open("box-breathing").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("04-box-breathing.png");
    note(ok4, "04 box breathing");

    // 5. Focus Sprint.
    scene("05 focus sprint");
    const ok5 = await ask(
      'Build me a focus timer plugin called "Focus Sprint": 25-minute work sessions and 5-minute breaks, a big minimal countdown, a field for "what am I working on", start/pause/skip, and a small log of today\'s completed sprints. Keep the same calm dark style as Box Breathing.',
      12 * 60 * 1000,
      "focus-sprint"
    );
    await open("focus-sprint").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("05-focus-sprint.png");
    note(ok5, "05 focus sprint");

    // 6. Daily Brief (composes Sources + Notes).
    scene("06 daily brief");
    const ok6 = await ask(
      'Build me a "Daily Brief" plugin. It should read the latest items from my Sources feed, pick the 3 most important ones, and show each as a card with a one-line takeaway and a link. Add a "Save to Notes" button on each card that creates a note with the takeaway and the source URL.',
      12 * 60 * 1000,
      "daily-brief"
    );
    await open("daily-brief").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("06-daily-brief.png");
    note(ok6, "06 daily brief");

    // 7. Box Breathing v2.
    scene("07 box breathing v2");
    const ok7 = await ask(
      "Update Box Breathing: add a mode selector with 4-7-8 breathing and a relaxed 5-5 mode, and add a soft ambient tone that rises on inhale and falls on exhale, with a mute button.",
      12 * 60 * 1000,
      "box-v2"
    );
    await open("box-breathing").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("07-box-v2.png");
    note(ok7, "07 box breathing v2");

    // 8. Approvals / activity.
    scene("08 approvals + activity");
    try {
      await open("inspect");
      await page.waitForTimeout(2500);
      await shot("08-inspect.png");
      note(true, "08 inspect");
    } catch (e) {
      note(false, "08 inspect", String(e).slice(0, 120));
    }

    // 9. Plugin manager.
    scene("09 plugin manager");
    try {
      await open("plugins");
      await page.waitForTimeout(2500);
      await shot("09-plugins.png");
      note(true, "09 plugins");
    } catch (e) {
      note(false, "09 plugins", String(e).slice(0, 120));
    }

    // 10. Rearrange dock.
    scene("10 rearrange dock");
    const ok10 = await ask(
      "Group my wellbeing plugins together and put Browser and Notes first.",
      8 * 60 * 1000,
      "rearrange"
    );
    await page.waitForTimeout(2000);
    await shot("10-dock.png");
    note(ok10, "10 rearrange dock");

    // 11. Reload persistence.
    scene("11 reload");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await shot("11-reloaded.png");
    note(true, "11 reload");

    // 12. Closing.
    scene("12 closing");
    const ok12 = await ask("What else can you build for me?", 8 * 60 * 1000, "closing");
    await page.waitForTimeout(2000);
    await shot("12-closing.png");
    note(ok12, "12 closing");
  } finally {
    stopApprover();
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(path.join(outDir, "scenes.json"), JSON.stringify(sceneLog, null, 1));
  console.log("\n=== capture summary ===");
  for (const [s, m] of results) console.log(`${s}  ${m}`);
  if (results.some(([s]) => s === "FAIL")) process.exit(1);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
