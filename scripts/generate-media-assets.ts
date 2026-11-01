import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(__dirname, "..");
const mediaDir = path.join(rootDir, "docs", "media");
const videosDir = path.join(mediaDir, "videos");
// Live capture output is the source of truth. Falls back to the primary
// walkthrough when re-running GIF/still extraction without re-recording.
const liveWalkthrough = path.join(videosDir, "polydocks-product-walkthrough.mp4");

fs.mkdirSync(videosDir, { recursive: true });

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

console.log("=== Phase 4: Generating Production Media Assets for Launch ===");
console.log("=== Scenario: agent mounts live Bitcoin price viewer (no flashcards) ===");

if (!fs.existsSync(liveWalkthrough)) {
  console.error(
    `Missing source video: ${liveWalkthrough}\n` +
      "Run the live capture first: bun scripts/record-live-onboarding.ts"
  );
  process.exit(1);
}

const sourceVideo = liveWalkthrough;

function gif(ss: string, to: string, width: number, out: string) {
  run(
    `ffmpeg -y -ss ${ss} -to ${to} -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=${width}:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${out}"`
  );
  console.log(`✓ Created ${path.basename(out)}:`, out);
}

// Stills from the live walkthrough (crisp high-res frames)
run(`ffmpeg -y -ss 00:29 -i "${sourceVideo}" -vframes 1 "${path.join(mediaDir, "dock.png")}"`);
console.log("✓ Created dock.png");
run(`ffmpeg -y -ss 00:19 -i "${sourceVideo}" -vframes 1 "${path.join(mediaDir, "environment-map.png")}"`);
console.log("✓ Created environment-map.png");

// Themes grid passthrough (built from theme stills when present)
const themesTarget = path.join(mediaDir, "themes.png");
if (fs.existsSync("/tmp/themes-grid.png")) {
  fs.copyFileSync("/tmp/themes-grid.png", themesTarget);
  console.log("✓ Created themes.png:", themesTarget);
} else {
  console.log("(skip themes.png: no /tmp/themes-grid.png; keeping live-capture still)");
}

// Spec GIF set: hero, thought-stream, browser, sandbox, build-a-tool, voice
gif("00:01", "00:26", 720, path.join(mediaDir, "hero.gif"));
gif("00:05", "00:12", 640, path.join(mediaDir, "thought-stream.gif"));
gif("00:12", "00:18", 640, path.join(mediaDir, "browser.gif"));
gif("00:18", "00:27", 640, path.join(mediaDir, "build-a-tool.gif"));
gif("00:20", "00:27", 640, path.join(mediaDir, "sandbox.gif"));
gif("00:01", "00:06", 640, path.join(mediaDir, "voice.gif"));

// Drop the retired flashcards-era research GIF so docs/media matches the spec set.
const staleResearch = path.join(mediaDir, "research.gif");
if (fs.existsSync(staleResearch)) {
  fs.unlinkSync(staleResearch);
  console.log("✓ Removed stale research.gif (flashcards-era artifact)");
}

// Spotlight feature videos
const feature1 = path.join(videosDir, "feature-01-agentic-dock.mp4");
const feature2 = path.join(videosDir, "feature-02-native-browser-research.mp4");
const feature3 = path.join(videosDir, "feature-03-agent-builds-plugins.mp4");
run(`ffmpeg -y -ss 00:00 -to 00:08 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature1}"`);
run(`ffmpeg -y -ss 00:06 -to 00:18 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature2}"`);
run(`ffmpeg -y -ss 00:17 -to 00:30 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature3}"`);
console.log("✓ Created feature spotlight videos in docs/media/videos/");

console.log("=== All media assets generated successfully! ===");
