/**
 * Build-time service worker generator.
 *
 * Walks the Vite build output (dist/) and emits dist/sw.js with the exact
 * list of assets available at the time of the build. Hashed asset filenames
 * are precache-safe, so the worker serves them cache-first.
 *
 * Runtime rules:
 * - Navigations: network-first, falling back to the cached index.html.
 * - Same-origin GETs: cache-first, adding misses to the runtime cache.
 * - /api/** and cross-origin requests are never served or cached by the SW.
 *
 * No dependencies: the worker file is plain text built from a small template.
 */

import { readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const SW_TEMPLATE = `/* Polymax service worker - generated at build time */
const CACHE = "polymax-{{BUILD_ID}}";
const PRECACHE_URLS = {{PRECACHE_URLS}};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })()
  );
});
`;

async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, baseDir)));
    } else {
      const relative = path.relative(baseDir, fullPath).split(path.sep).join("/");
      if (relative === "sw.js") continue;
      files.push(`/${relative}`);
    }
  }
  return files;
}

export async function generateServiceWorkerFile(distDir: string): Promise<void> {
  const urls = (await collectFiles(distDir, distDir)).sort();
  if (!urls.includes("/index.html")) {
    throw new Error(`generate-sw: ${distDir}/index.html not found`);
  }

  // Cache version derived from the precached manifest so unchanged builds
  // keep the same cache and re-installs are cheap.
  const hash = createHash("sha256");
  for (const url of urls) {
    hash.update(url);
    const info = await stat(path.join(distDir, url.slice(1)));
    hash.update(String(info.size));
  }

  const content = SW_TEMPLATE.replace("{{BUILD_ID}}", hash.digest("hex").slice(0, 12))
    .replace(
      "{{PRECACHE_URLS}}",
      JSON.stringify(urls.map((url) => (url === "/index.html" ? "/" : url)))
    );

  await writeFile(path.join(distDir, "sw.js"), content);
}

if (import.meta.main) {
  await generateServiceWorkerFile(process.argv[2] || "dist");
}
