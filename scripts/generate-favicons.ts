/**
 * Regenerate PNG favicon fallbacks from public/favicon.svg.
 * The 16px variant uses a thicker pill and larger dots with no glow,
 * so the dock indicators stay legible at tab size. The Orb itself is
 * never altered.
 */
import fs from "node:fs";
import sharp from "sharp";

const root = new URL("..", import.meta.url).pathname;

async function main() {
  const svg = fs.readFileSync(`${root}/public/favicon.svg`, "utf-8");

  await sharp(Buffer.from(svg)).resize(32, 32).png().toFile(`${root}/public/favicon-32x32.png`);
  await sharp(Buffer.from(svg)).resize(48, 48).png().toFile(`${root}/public/favicon-48x48.png`);

  const small = svg
    .replace('y="51" width="44" height="10" rx="5"', 'y="50" width="44" height="12" rx="6"')
    .replaceAll('cy="56" r="2.4"', 'cy="56" r="3"')
    .replace(/<circle fill="url\(#favGlow\)"[^/]*\/>/, "");
  await sharp(Buffer.from(small)).resize(16, 16).png().toFile(`${root}/public/favicon-16x16.png`);
  console.log("favicons regenerated");
}

main();
