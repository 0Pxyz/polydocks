/**
 * Demo capture part 2: retries + missing scenes (05b, 06b, 07b, 10, 11, 12).
 * Same conventions as capture-demo.ts. Run after part 1.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outDir = "/tmp/polydocks-demo";
const baseUrl = process.env.CAPTURE_URL ?? "http://localhost:5173";
const apiUrl = "http://localhost:3000";
const headers = { "Content-Type": "application/json", "X-Polymax-User": "local" };

const results: Array<[string, string]> = [];
const t0 = Date.now();
const stamp = () => Math.round((Date.now() - t0) / 1000);
function note(ok: boolean, name: string, detail = "") {
  results.push([ok ? "ok" : "FAIL", `${name}${detail ? ` — ${detail}` : ""}`]);
  console.log(`${ok ? "✓" : "✗"} [${stamp()}s] ${name}${detail ? `: ${detail}` : ""}`);
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
async function waitForTurn(since: number, timeoutMs: number, label: string): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  let last = since;
  let quietSince = Date.now();
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const t: any = await api("GET", "/api/agent/thread?limit=6");
      for (const m of t?.messages ?? []) {
        if (Number(m.seq) > since && (m.role === "assistant" || m.role === "error")) {
          const txt = String(m.content ?? m.text ?? "").slice(0, 120).replace(/\n+/g, " ");
          console.log(`  turn update [${stamp()}s]: ${m.role}: ${txt}`);
          if (m.role === "error") return false;
          if (Number(m.seq) !== last) {
            last = Number(m.seq);
            quietSince = Date.now();
          } else if (Date.now() - quietSince > 25000) {
            console.log(`  turn settled [${stamp()}s] (${label})`);
            return true;
          }
        }
      }
    } catch (e) {
      console.log(`  poll error: ${String(e).slice(0, 100)}`);
    }
  }
  console.log(`  TIMEOUT waiting for turn (${label})`);
  return false;
}
function startApprover(): () => void {
  const seen = new Map<string, number>();
  const iv = setInterval(async () => {
    try {
      const list: any = await api("GET", "/api/agent/approvals");
      const items = list?.data ?? [];
      for (const a of items) {
        const id = String(a.id ?? "");
        if (!id || a.status !== "pending") continue;
        if (!seen.has(id)) {
          seen.set(id, Date.now());
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
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e: any) => console.log(`[pageerror] ${String(e).slice(0, 140)}`));
  await page.addInitScript(() => {
    localStorage.setItem("polymax_onboarding_completed_v2", "true");
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const stopApprover = startApprover();
  const shot = (name: string) =>
    page.screenshot({ path: path.join(outDir, name), timeout: 20000 });
  const open = (id: string) =>
    page.evaluate((t) => (window as any).__dockStore.getState().openTool(t), id);

  async function ask(prompt: string, waitMs: number, label: string): Promise<boolean> {
    const since = await lastSeq().catch(() => 0);
    await open("agent").catch(() => {});
    await page.waitForTimeout(1000);
    const orb = page.locator("[data-home-orb]");
    if ((await orb.count()) > 0) await orb.first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const box = page.locator("textarea").first();
    await box.waitFor({ timeout: 20000 });
    await box.fill(prompt);
    await box.press("Enter");
    console.log(`  sent [${stamp()}s] (${label}): ${prompt.slice(0, 90)}`);
    return waitForTurn(since, waitMs, label);
  }

  try {
    // 05b. Focus Sprint rebuilt in the foreground (no background detour).
    console.log("\n===== SCENE 05b focus sprint =====");
    const ok5 = await ask(
      "Build a focus timer plugin with id focus-sprint: 25-minute work sessions and 5-minute breaks, a big minimal countdown, a field for what I am working on, start/pause/skip, and a small log of today's completed sprints. Keep the calm dark style.",
      12 * 60 * 1000,
      "focus-sprint"
    );
    try {
      await open("focus-sprint");
    } catch {
      await open("focus-timer").catch(() => {});
    }
    await page.waitForTimeout(3000);
    await shot("05b-focus-sprint.png");
    note(ok5, "05b focus sprint");

    // 06b. Daily Brief, phrased to avoid the deterministic open hijack.
    console.log("\n===== SCENE 06b daily brief =====");
    const ok6 = await ask(
      "Create a plugin with id daily-brief: use find_capabilities to find how to read my saved articles feed, pick the 3 most important items, and show each as a card with a one-line takeaway and a link. Add a Save button on each card that stores a note with the takeaway and the URL via the notes capabilities.",
      12 * 60 * 1000,
      "daily-brief"
    );
    await open("daily-brief").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("06b-daily-brief.png");
    note(ok6, "06b daily brief");

    // 07b. Box Breathing v2 retry.
    console.log("\n===== SCENE 07b box v2 =====");
    const ok7 = await ask(
      "Modify the box-breathing plugin: add a mode selector with 4-7-8 breathing and a relaxed 5-5 mode, plus a mute toggle.",
      12 * 60 * 1000,
      "box-v2"
    );
    await open("box-breathing").catch(() => {});
    await page.waitForTimeout(3000);
    await shot("07b-box-v2.png");
    note(ok7, "07b box v2");

    // 10. Rearrange dock.
    console.log("\n===== SCENE 10 rearrange =====");
    const ok10 = await ask(
      "Group my wellbeing plugins together and put Browser and Notes first.",
      8 * 60 * 1000,
      "rearrange"
    );
    await page.waitForTimeout(2000);
    await shot("10-dock.png");
    note(ok10, "10 rearrange dock");

    // 11. Reload persistence.
    console.log("\n===== SCENE 11 reload =====");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await shot("11-reloaded.png");
    note(true, "11 reload");

    // 12. Closing.
    console.log("\n===== SCENE 12 closing =====");
    const ok12 = await ask("What else can you build for me?", 8 * 60 * 1000, "closing");
    await page.waitForTimeout(2000);
    await shot("12-closing.png");
    note(ok12, "12 closing");
  } finally {
    stopApprover();
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  console.log("\n=== part2 summary ===");
  for (const [s, m] of results) console.log(`${s}  ${m}`);
  if (results.some(([s]) => s === "FAIL")) process.exit(1);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
