import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const rootDir = path.resolve(__dirname, "..");
const mediaDir = path.join(rootDir, "docs", "media");
const videosDir = path.join(mediaDir, "videos");
const captureDir = "/tmp/polydocks-capture";

fs.mkdirSync(videosDir, { recursive: true });
fs.mkdirSync(captureDir, { recursive: true });

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  console.log("=== Autonomous Live Onboarding Capture & Production ===");
  console.log("=== Scenario: agent mounts live Bitcoin price viewer (no flashcards) ===");
  const baseUrl = process.env.CAPTURE_URL ?? "http://localhost:5173";

  for (const f of fs.readdirSync(captureDir)) {
    try {
      fs.unlinkSync(path.join(captureDir, f));
    } catch {}
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  // Warm-up pass: primes the dev server (optimizer + module graph) so the
  // recorded take starts on rendered UI, never a white loading flash.
  console.log("Warming up dev server UI...");
  const warmCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const warmPage = await warmCtx.newPage();
  await warmPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  try {
    await warmPage.waitForFunction(
      () => document.body.innerText.includes("Welcome to your new workspace"),
      { timeout: 60000 }
    );
  } catch {
    console.log("(warm-up marker not seen; continuing anyway)");
  }
  await warmPage.waitForTimeout(2000);
  await warmCtx.close();
  console.log("✓ Warm-up complete");

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: captureDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  console.log(`Navigating to PolyDocks on ${baseUrl}/ ...`);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("Welcome to your new workspace"),
      { timeout: 60000 }
    );
  } catch {
    console.log("(content marker not seen; continuing anyway)");
  }
  await page.waitForTimeout(2000);

  // Phase 1: Cinematic onboarding stage from the dock
  console.log(">>> Phase 1: Open Onboarding Stage & Voice Welcome");
  await page.evaluate(() => {
    // @ts-ignore
    window.__dockStore?.getState().openTool("onboarding");
    // @ts-ignore
    window.__dockStore?.getState().focusTool("onboarding");
    // @ts-ignore
    window.__onboardingStore?.getState().resetOnboarding();
  });
  await page.waitForTimeout(4000);

  try {
    const agentBtn = page.locator("text=Ask Poly to run demo").first();
    if (await agentBtn.isVisible()) {
      console.log(">>> Triggering real Agent Execution from Tab...");
      await agentBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.log("Agent trigger note:", err);
  }

  // Phase 2: Authentic agent research with TinyFish thought stream
  console.log(">>> Phase 2: Autonomous Research (TinyFish Branding Active)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("research");
  });
  await page.waitForTimeout(6000);

  // Phase 3: Workspace comes alive (native Browser surface)
  console.log(">>> Phase 3: Workspace Comes Alive (Native Browser Surface)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("workspace");
  });
  await page.waitForTimeout(6000);

  // Phase 4: Agent builds + mounts live Bitcoin price viewer
  console.log(">>> Phase 4: Your Dock, Your Tools (Bitcoin Viewer Synthesis & Mount)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("tools");
  });
  await page.waitForTimeout(1500);
  // Mount the viewer as an interactive dock tool so the capture shows a
  // real agent-built surface (not a static card).
  await page.evaluate(() => {
    // @ts-ignore
    window.__dockStore?.getState().openTool("bitcoin-viewer");
    // @ts-ignore
    window.__dockStore?.getState().focusTool("bitcoin-viewer");
  });
  await page.waitForTimeout(2000);

  // Authentic interaction with the synthesized tool: switch timeframe + currency
  try {
    const h1 = page.locator('button:has-text("1H")').first();
    if (await h1.isVisible()) {
      await h1.click();
      await page.waitForTimeout(1200);
    }
    const eur = page.locator('button:has-text("EUR")').first();
    if (await eur.isVisible()) {
      await eur.click();
      await page.waitForTimeout(1200);
    }
    const usd = page.locator('button:has-text("USD")').first();
    if (await usd.isVisible()) {
      await usd.click();
      await page.waitForTimeout(1200);
    }
  } catch (err) {
    console.log("Interaction skipped:", err);
  }

  // Phase 5: Handoff & workspace ready
  console.log(">>> Phase 5: Workspace Ready (Autonomous Handoff)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("handoff");
  });
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().completeDemo();
  });
  await page.waitForTimeout(3000);

  // Close the recording context first so the walkthrough video ends here
  // (~35s, within the 30-45s spec). Theme stills use their own contexts.
  await page.close();
  await context.close();

  // Theme stills: one clean dock + Bitcoin viewer frame per theme for themes.png
  console.log(">>> Phase 6: Theme Matrix Stills (void, cyber, amber, amethyst)");
  const themeIds = ["void", "cyber", "amber", "amethyst"];
  for (const themeId of themeIds) {
    const tctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await tctx.addInitScript((t) => {
      try {
        localStorage.setItem(
          "polymax-theme-config",
          JSON.stringify({
            theme: t,
            customAccentColor: null,
            wallpaperUrl: null,
            wallpaperFit: "cover",
            wallpaperOpacity: 0.25,
            wallpaperBlur: 0,
            dockStyle: "glass",
            dockPosition: "top",
          })
        );
      } catch {}
    }, themeId);
    const tpage = await tctx.newPage();
    await tpage.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await tpage.waitForTimeout(2500);
    await tpage.evaluate(() => {
      // @ts-ignore
      window.__onboardingStore?.getState().completeDemo();
      // @ts-ignore
      window.__dockStore?.getState().openTool("bitcoin-viewer");
      // @ts-ignore
      window.__dockStore?.getState().focusTool("bitcoin-viewer");
    });
    await tpage.waitForTimeout(2500);
    await tpage.screenshot({ path: path.join(captureDir, `theme-${themeId}.png`) });
    console.log(`✓ Captured theme still: ${themeId}`);
    await tctx.close();
  }

  await browser.close();

  const videoFiles = fs.readdirSync(captureDir).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length === 0) {
    throw new Error("No recorded video file found in " + captureDir);
  }
  const rawWebm = path.join(captureDir, videoFiles[0]);
  console.log("✓ Recorded raw live demo video:", rawWebm);

  // Detect content start: cold dev-server boots show a white loading flash
  // before React mounts. Trim it so every derived asset starts on real UI.
  async function meanBrightness(pngPath: string): Promise<number> {
    const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const n = info.width * info.height;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += (data[i * ch] + data[i * ch + 1] + data[i * ch + 2]) / 3;
    return sum / n;
  }
  let trimSec = 0;
  for (let s = 0; s <= 20; s++) {
    const probe = path.join(captureDir, `probe-${s}.png`);
    execSync(`ffmpeg -y -v error -ss ${s} -i "${rawWebm}" -vframes 1 "${probe}"`);
    if ((await meanBrightness(probe)) < 200) {
      trimSec = s;
      break;
    }
  }
  console.log(`✓ Content starts at ${trimSec}s (white loading head trimmed)`);

  const primaryWalkthrough = path.join(videosDir, "polydocks-product-walkthrough.mp4");
  run(
    `ffmpeg -y -ss ${trimSec} -i "${rawWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p "${primaryWalkthrough}"`
  );
  console.log("✓ Created primary walkthrough video:", primaryWalkthrough);

  // Spotlight feature videos (ranges track the 5-phase flow above)
  const feature1 = path.join(videosDir, "feature-01-agentic-dock.mp4");
  run(`ffmpeg -y -ss 00:00 -to 00:08 -i "${primaryWalkthrough}" -c copy "${feature1}"`);

  const feature2 = path.join(videosDir, "feature-02-native-browser-research.mp4");
  run(`ffmpeg -y -ss 00:06 -to 00:18 -i "${primaryWalkthrough}" -c copy "${feature2}"`);

  const feature3 = path.join(videosDir, "feature-03-agent-builds-plugins.mp4");
  run(`ffmpeg -y -ss 00:17 -to 00:30 -i "${primaryWalkthrough}" -c copy "${feature3}"`);

  console.log("✓ Created spotlight feature videos in docs/media/videos/");

  const dockTarget = path.join(mediaDir, "dock.png");
  run(`ffmpeg -y -ss 00:29 -i "${primaryWalkthrough}" -vframes 1 "${dockTarget}"`);
  console.log("✓ Created dock.png:", dockTarget);

  const envMapTarget = path.join(mediaDir, "environment-map.png");
  run(`ffmpeg -y -ss 00:19 -i "${primaryWalkthrough}" -vframes 1 "${envMapTarget}"`);
  console.log("✓ Created environment-map.png:", envMapTarget);

  const themesTarget = path.join(mediaDir, "themes.png");
  const voidTheme = path.join(captureDir, "theme-void.png");
  if (fs.existsSync(voidTheme)) {
    run(
      `ffmpeg -y -i "${path.join(captureDir, "theme-void.png")}" -i "${path.join(captureDir, "theme-cyber.png")}" -i "${path.join(captureDir, "theme-amber.png")}" -i "${path.join(captureDir, "theme-amethyst.png")}" -filter_complex "[0:v][1:v]hstack[top];[2:v][3:v]hstack[bottom];[top][bottom]vstack,scale=1280:-1:flags=lanczos" "${themesTarget}"`
    );
    console.log("✓ Created themes.png:", themesTarget);
  }

  function createGif(ss: string, to: string, width: number, outPath: string) {
    run(
      `ffmpeg -y -ss ${ss} -to ${to} -i "${primaryWalkthrough}" -filter_complex "[0:v] fps=12,scale=${width}:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${outPath}"`
    );
    console.log(`✓ Created GIF (${path.basename(outPath)}):`, outPath);
  }

  // Hero: prompt -> dock execution -> live Bitcoin tool mounted
  createGif("00:01", "00:26", 720, path.join(mediaDir, "hero.gif"));
  // Thought stream: TinyFish reasoning line
  createGif("00:05", "00:12", 640, path.join(mediaDir, "thought-stream.gif"));
  // Native browser surface
  createGif("00:12", "00:18", 640, path.join(mediaDir, "browser.gif"));
  // Build-a-tool: synthesizing + mounting the Bitcoin viewer
  createGif("00:18", "00:27", 640, path.join(mediaDir, "build-a-tool.gif"));
  // Sandbox: interactive tool execution inside dock
  createGif("00:20", "00:27", 640, path.join(mediaDir, "sandbox.gif"));
  // Voice: orb breathing and greeting
  createGif("00:01", "00:06", 640, path.join(mediaDir, "voice.gif"));

  // Drop the retired flashcards-era research GIF so docs/media matches the spec set.
  const staleResearch = path.join(mediaDir, "research.gif");
  if (fs.existsSync(staleResearch)) {
    fs.unlinkSync(staleResearch);
    console.log("✓ Removed stale research.gif (flashcards-era artifact)");
  }

  // Clean up brightness-probe frames (keep theme stills for inspection).
  for (const f of fs.readdirSync(captureDir)) {
    if (f.startsWith("probe-") && f.endsWith(".png")) {
      try {
        fs.unlinkSync(path.join(captureDir, f));
      } catch {}
    }
  }

  console.log("=== All production media assets generated successfully! ===");
}

main().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
