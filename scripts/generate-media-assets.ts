import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(__dirname, "..");
const mediaDir = path.join(rootDir, "docs", "media");
const videosDir = path.join(mediaDir, "videos");
const sourceVideo = "/home/px/Work/meta-hackathon-indie/internal-docs/marketing/polydocks-journey.mp4";
const rawVideo = "/home/px/Work/meta-hackathon-indie/internal-docs/marketing/raw-take5.webm";
const marketingDir = "/home/px/Work/meta-hackathon-indie/internal-docs/marketing";

fs.mkdirSync(videosDir, { recursive: true });

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

console.log("=== Phase 4: Generating Production Media Assets for Launch ===");

// 1. Copy the full product walkthrough video
const walkthroughTarget = path.join(videosDir, "polydocks-product-walkthrough.mp4");
if (fs.existsSync(sourceVideo)) {
  fs.copyFileSync(sourceVideo, walkthroughTarget);
  console.log("✓ Created walkthrough video:", walkthroughTarget);
}

// 2. Generate dock.png (clean high-res dock shot)
const dockSource = path.join(marketingDir, "scene-02b-dock-hover.png");
const dockTarget = path.join(mediaDir, "dock.png");
if (fs.existsSync(dockSource)) {
  fs.copyFileSync(dockSource, dockTarget);
  console.log("✓ Created dock.png:", dockTarget);
}

// 3. Generate hero.gif (12s composite of full flow: prompt -> TinyFish research -> tool mounted)
// Using two-pass palettegen for crisp Bayer dither
const heroTarget = path.join(mediaDir, "hero.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 08.5 -to 20.5 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=720:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${heroTarget}"`
  );
  console.log("✓ Created hero.gif:", heroTarget);
}

// 4. Generate thought-stream.gif (transient reasoning stream + TinyFish branding)
const thoughtTarget = path.join(mediaDir, "thought-stream.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 34.5 -to 46.5 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${thoughtTarget}"`
  );
  console.log("✓ Created thought-stream.gif:", thoughtTarget);
}

// 5. Generate research.gif (briefing results and sources)
const researchTarget = path.join(mediaDir, "research.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 54.0 -to 63.0 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${researchTarget}"`
  );
  console.log("✓ Created research.gif:", researchTarget);
}

// 6. Generate build-a-tool.gif (agent creating and mounting flashcard tool into dock)
const buildToolTarget = path.join(mediaDir, "build-a-tool.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 126.0 -to 136.0 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${buildToolTarget}"`
  );
  console.log("✓ Created build-a-tool.gif:", buildToolTarget);
}

// 7. Generate browser.gif (native browser and sources)
const browserTarget = path.join(mediaDir, "browser.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 10.0 -to 18.0 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${browserTarget}"`
  );
  console.log("✓ Created browser.gif:", browserTarget);
}

// 8. Generate sandbox.gif (sandboxed iframe tool execution)
const sandboxTarget = path.join(mediaDir, "sandbox.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 130.0 -to 137.0 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${sandboxTarget}"`
  );
  console.log("✓ Created sandbox.gif:", sandboxTarget);
}

// 9. Generate voice.gif (voice interaction)
const voiceTarget = path.join(mediaDir, "voice.gif");
if (fs.existsSync(sourceVideo)) {
  run(
    `ffmpeg -y -ss 04.5 -to 09.5 -i "${sourceVideo}" -filter_complex "[0:v] fps=12,scale=640:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${voiceTarget}"`
  );
  console.log("✓ Created voice.gif:", voiceTarget);
}

// 10. Generate themes.png (2x2 grid of Void, Cyber, Amber, Amethyst)
const themesTarget = path.join(mediaDir, "themes.png");
if (fs.existsSync("/tmp/themes-grid.png")) {
  fs.copyFileSync("/tmp/themes-grid.png", themesTarget);
  console.log("✓ Created themes.png:", themesTarget);
}

// 11. Generate environment-map.png
const envMapSource = path.join(marketingDir, "scene-11-full-product.png");
const envMapTarget = path.join(mediaDir, "environment-map.png");
if (fs.existsSync(envMapSource)) {
  fs.copyFileSync(envMapSource, envMapTarget);
  console.log("✓ Created environment-map.png:", envMapTarget);
}

// 12. Short spotlight feature videos in docs/media/videos/
const feature1 = path.join(videosDir, "feature-01-agentic-dock.mp4");
const feature2 = path.join(videosDir, "feature-02-native-browser-research.mp4");
const feature3 = path.join(videosDir, "feature-03-agent-builds-plugins.mp4");

if (fs.existsSync(sourceVideo)) {
  run(`ffmpeg -y -ss 04.0 -to 27.0 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature1}"`);
  run(`ffmpeg -y -ss 27.0 -to 62.0 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature2}"`);
  run(`ffmpeg -y -ss 82.0 -to 138.0 -i "${sourceVideo}" -c:v libx264 -preset fast -crf 22 -c:a aac "${feature3}"`);
  console.log("✓ Created feature spotlight videos in docs/media/videos/");
}

console.log("=== All media assets generated successfully! ===");
