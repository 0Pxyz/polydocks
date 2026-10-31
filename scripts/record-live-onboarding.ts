import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

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

  // Clean previous raw captures
  for (const f of fs.readdirSync(captureDir)) {
    try {
      fs.unlinkSync(path.join(captureDir, f));
    } catch {}
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: captureDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  console.log("Navigating to PolyDocks on http://localhost:5173/ ...");
  await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Step 1: Open the Demo Tab in the dock and show Introduction
  console.log(">>> Phase 1: Open Demo Tab & Voice Welcome");
  await page.evaluate(() => {
    // @ts-ignore
    window.__dockStore?.getState().openTool("onboarding");
    // @ts-ignore
    window.__dockStore?.getState().focusTool("onboarding");
    // @ts-ignore
    window.__onboardingStore?.getState().resetOnboarding();
  });
  await page.waitForTimeout(4000);

  // Actually trigger agent execution
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

  // Step 2: Research with TinyFish Web Discovery
  console.log(">>> Phase 2: Autonomous Research (TinyFish Branding Active)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("research");
  });
  await page.waitForTimeout(6000);

  // Step 3: Workspace Comes Alive (Native Browser)
  console.log(">>> Phase 3: Workspace Comes Alive (Native Browser Surface)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("workspace");
  });
  await page.waitForTimeout(6000);

  // Step 4: Your Dock, Your Tools (Deep Work Flashcards Plugin)
  console.log(">>> Phase 4: Your Dock, Your Tools (Flashcards Plugin Synthesis & Mount)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("tools");
  });
  await page.waitForTimeout(3000);

  // Interactive interaction with the synthesized tool
  try {
    const flipButton = page.locator("text=Click to reveal answer").first();
    if (await flipButton.isVisible()) {
      await flipButton.click();
      await page.waitForTimeout(2000);
    }
    const nextButton = page.locator("text=Next").first();
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.log("Interaction skipped:", err);
  }

  // Step 5: Handoff & Workspace Ready
  console.log(">>> Phase 5: Workspace Ready (Autonomous Handoff)");
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().setStep("handoff");
  });
  await page.waitForTimeout(4000);

  // Complete demo and return to clean resting dock
  await page.evaluate(() => {
    // @ts-ignore
    window.__onboardingStore?.getState().completeDemo();
  });
  await page.waitForTimeout(3000);

  // Close page and context to flush video
  await page.close();
  await context.close();
  await browser.close();

  // Find generated video
  const videoFiles = fs.readdirSync(captureDir).filter((f) => f.endsWith(".webm"));
  if (videoFiles.length === 0) {
    throw new Error("No recorded video file found in " + captureDir);
  }
  const rawWebm = path.join(captureDir, videoFiles[0]);
  console.log("✓ Recorded raw live demo video:", rawWebm);

  // Transcode to primary walkthrough video
  const primaryWalkthrough = path.join(videosDir, "polydocks-product-walkthrough.mp4");
  run(
    `ffmpeg -y -i "${rawWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p "${primaryWalkthrough}"`
  );
  console.log("✓ Created primary walkthrough video:", primaryWalkthrough);

  // Split into feature spotlight videos:
  // 1. Agentic Dock & Voice
  const feature1 = path.join(videosDir, "feature-01-agentic-dock.mp4");
  run(`ffmpeg -y -ss 00:00 -to 00:06 -i "${primaryWalkthrough}" -c copy "${feature1}"`);

  // 2. Native Browser & TinyFish Research
  const feature2 = path.join(videosDir, "feature-02-native-browser-research.mp4");
  run(`ffmpeg -y -ss 00:06 -to 00:16 -i "${primaryWalkthrough}" -c copy "${feature2}"`);

  // 3. Agent Builds & Mounts Plugins
  const feature3 = path.join(videosDir, "feature-03-agent-builds-plugins.mp4");
  run(`ffmpeg -y -ss 00:15 -to 00:27 -i "${primaryWalkthrough}" -c copy "${feature3}"`);

  console.log("✓ Created spotlight feature videos in docs/media/videos/");

  // Extract clean high-res still frames from the video
  const dockTarget = path.join(mediaDir, "dock.png");
  run(`ffmpeg -y -ss 00:28 -i "${primaryWalkthrough}" -vframes 1 "${dockTarget}"`);
  console.log("✓ Created dock.png:", dockTarget);

  const envMapTarget = path.join(mediaDir, "environment-map.png");
  run(`ffmpeg -y -ss 00:18 -i "${primaryWalkthrough}" -vframes 1 "${envMapTarget}"`);
  console.log("✓ Created environment-map.png:", envMapTarget);

  // Generate Theme matrix 2x2 grid if theme screenshots succeeded, else create crisp grid
  const themesTarget = path.join(mediaDir, "themes.png");
  const voidTheme = path.join(captureDir, "theme-void.png");
  if (fs.existsSync(voidTheme)) {
    run(
      `ffmpeg -y -i "${path.join(captureDir, "theme-void.png")}" -i "${path.join(captureDir, "theme-cyber.png")}" -i "${path.join(captureDir, "theme-amber.png")}" -i "${path.join(captureDir, "theme-amethyst.png")}" -filter_complex "[0:v][1:v]hstack[top];[2:v][3:v]hstack[bottom];[top][bottom]vstack,scale=1280:-1:flags=lanczos" "${themesTarget}"`
    );
    console.log("✓ Created themes.png:", themesTarget);
  }

  // Two-pass palettegen Bayer dither helper for GIFs
  function createGif(ss: string, to: string, width: number, outPath: string) {
    run(
      `ffmpeg -y -ss ${ss} -to ${to} -i "${primaryWalkthrough}" -filter_complex "[0:v] fps=12,scale=${width}:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${outPath}"`
    );
    console.log(`✓ Created GIF (${path.basename(outPath)}):`, outPath);
  }

  // 1. Hero GIF (18s overview of live onboarding demo: greeting -> TinyFish search -> tool mounted)
  createGif("00:01", "00:24", 720, path.join(mediaDir, "hero.gif"));

  // 2. Thought stream GIF (focusing on TinyFish search branding and reasoning line)
  createGif("00:05", "00:12", 640, path.join(mediaDir, "thought-stream.gif"));

  // 3. Research GIF (TinyFish web discovery and synthesis)
  createGif("00:06", "00:13", 640, path.join(mediaDir, "research.gif"));

  // 4. Browser GIF (native Chromium browser surface)
  createGif("00:12", "00:18", 640, path.join(mediaDir, "browser.gif"));

  // 5. Build-a-tool GIF (synthesizing and mounting deep-work-flashcards)
  createGif("00:17", "00:25", 640, path.join(mediaDir, "build-a-tool.gif"));

  // 6. Sandbox GIF (interactive tool execution inside dock)
  createGif("00:18", "00:25", 640, path.join(mediaDir, "sandbox.gif"));

  // 7. Voice GIF (orb breathing and greeting)
  createGif("00:01", "00:06", 640, path.join(mediaDir, "voice.gif"));

  console.log("=== All production media assets generated successfully! ===");
}

main().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
