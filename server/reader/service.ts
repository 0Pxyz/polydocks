import dns from "node:dns/promises";
import { config } from "../config";
import { validateUrlForSsrf, isPrivateOrReservedIPv4, isPrivateOrReservedIPv6 } from "../plugins/ssrf";
import { youtubeEmbedUrl } from "../video/ids";
import { tinyfish } from "../discovery/tinyfish";

export type ReaderKind = "video" | "article";

export interface ReaderContent {
  kind: ReaderKind;
  url: string;
  title: string;
  markdown?: string;
  embedUrl?: string;
  contentType?: string;
  truncated?: boolean;
}

const MAX_READER_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 100;

const cache = new Map<string, { expires: number; data: ReaderContent }>();

function cacheGet(url: string): ReaderContent | null {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(url);
    return null;
  }
  return hit.data;
}

function cacheSet(url: string, data: ReaderContent): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, { expires: Date.now() + CACHE_TTL_MS, data });
}

export function clearReaderCache(): void {
  cache.clear();
}

/**
 * Pure URL classification: YouTube/Vimeo/direct video files become embeds,
 * everything else is an article. No network access.
 */
export function classifyReaderUrl(rawUrl: string): { kind: ReaderKind; embedUrl?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { kind: "article" };
  }
  const host = parsed.hostname.toLowerCase();

  const ytEmbed = youtubeEmbedUrl(rawUrl);
  if (ytEmbed) {
    return { kind: "video", embedUrl: ytEmbed };
  }

  const vimeoMatch = host.includes("vimeo.com") ? parsed.pathname.match(/^\/(\d+)/) : null;
  if (vimeoMatch) {
    return { kind: "video", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  if (/\.(mp4|webm|ogv|mov)(\?.*)?$/i.test(parsed.pathname)) {
    return { kind: "video", embedUrl: parsed.toString() };
  }

  return { kind: "article" };
}

/**
 * Best-effort DNS rebinding guard: resolves the hostname and rejects it when
 * it points at private/loopback/link-local space. Lookup failures are allowed
 * through (static hostname checks already ran); the limitation is documented.
 */
async function guardDns(hostname: string): Promise<string | null> {
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    for (const a of addrs) {
      if (a.family === 4 && isPrivateOrReservedIPv4(a.address)) {
        return `Blocked target: hostname "${hostname}" resolves to private IPv4 ${a.address}.`;
      }
      if (a.family === 6 && isPrivateOrReservedIPv6(a.address)) {
        return `Blocked target: hostname "${hostname}" resolves to private IPv6 ${a.address}.`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Naive HTML -> Markdown fallback when TinyFish is not configured.
 * Strips scripts/styles/nav/footer, keeps headings/paragraphs/lists/links.
 */
export function htmlToMarkdown(html: string): { title: string; markdown: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : "Article";

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|footer|header|aside|form|noscript)[\s\S]*?<\/\1>/gi, "");

  const out: string[] = [];
  const push = (line: string) => {
    const clean = decodeEntities(line.replace(/\s+/g, " ").trim());
    if (clean) out.push(clean);
  };

  const blockRe = /<(h1|h2|h3|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    let inner = m[2].replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_a, href, label) => {
      const cleanLabel = label.replace(/<[^>]+>/g, "").trim();
      return href && href.startsWith("http") ? `[${cleanLabel}](${href})` : cleanLabel;
    });
    inner = inner.replace(/<[^>]+>/g, "");
    if (!inner.trim()) continue;
    if (tag === "h1") push(`# ${inner}`);
    else if (tag === "h2") push(`## ${inner}`);
    else if (tag === "h3") push(`### ${inner}`);
    else if (tag === "li") push(`- ${inner}`);
    else if (tag === "blockquote") push(`> ${inner}`);
    else push(inner);
    if (out.join("\n").length > 60_000) break;
  }

  if (out.length === 0) {
    const fallback = decodeEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 8000);
    if (fallback) out.push(fallback);
  }

  return { title, markdown: out.join("\n\n").slice(0, 60_000) };
}

/**
 * Loads reader content for a URL: SSRF-checked (static + DNS), size-capped,
 * cached. Video URLs never fetch a body; articles prefer TinyFish markdown
 * when configured and fall back to local extraction.
 */
export async function loadReaderContent(rawUrl: string): Promise<ReaderContent> {
  const ssrf = validateUrlForSsrf(rawUrl);
  if (!ssrf.safe || !ssrf.url) {
    throw new Error(ssrf.reason || "Blocked URL");
  }
  const dnsBlock = await guardDns(ssrf.url.hostname);
  if (dnsBlock) throw new Error(dnsBlock);

  const canonical = ssrf.url.toString();
  const cached = cacheGet(canonical);
  if (cached) return cached;

  const classified = classifyReaderUrl(canonical);
  if (classified.kind === "video" && classified.embedUrl) {
    const data: ReaderContent = {
      kind: "video",
      url: canonical,
      title: "Video",
      embedUrl: classified.embedUrl,
    };
    cacheSet(canonical, data);
    return data;
  }

  // Article: prefer TinyFish Chromium-rendered Markdown when configured.
  if (config.TINYFISH_API_KEY && config.TINYFISH_API_KEY.trim().length > 0) {
    try {
      const pages = await tinyfish.fetch([canonical]);
      const page = pages[0];
      if (page && page.markdown) {
        const data: ReaderContent = {
          kind: "article",
          url: canonical,
          title: canonical,
          markdown: page.markdown.slice(0, 60_000),
          truncated: page.markdown.length > 60_000,
        };
        cacheSet(canonical, data);
        return data;
      }
    } catch {
      // Fall through to direct fetch.
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Manual redirect walk so every hop is SSRF re-validated.
    let current = canonical;
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const hopCheck = validateUrlForSsrf(current);
      if (!hopCheck.safe || !hopCheck.url) throw new Error(hopCheck.reason || "Blocked redirect target");
      const hopDns = await guardDns(hopCheck.url.hostname);
      if (hopDns) throw new Error(hopDns);
      res = await fetch(hopCheck.url.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "PolydocksReader/1.0", Accept: "text/html,application/xhtml+xml" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new Error(`Reader fetch failed: HTTP ${res?.status || "unknown"}`);

    const contentType = res.headers.get("content-type") || "";
    const lengthHeader = res.headers.get("content-length");
    if (lengthHeader && Number.parseInt(lengthHeader, 10) > MAX_READER_BYTES) {
      throw new Error("Reader content exceeds the 1.5 MB limit");
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_READER_BYTES) throw new Error("Reader content exceeds the 1.5 MB limit");
    const html = new TextDecoder().decode(buf);

    if (!/html/i.test(contentType) && !/^[\s<]/.test(html.slice(0, 200))) {
      throw new Error(`Unsupported content type for Reader: ${contentType || "unknown"}`);
    }

    const { title, markdown } = htmlToMarkdown(html);
    const data: ReaderContent = {
      kind: "article",
      url: current,
      title,
      markdown,
      contentType,
      truncated: buf.length >= MAX_READER_BYTES,
    };
    cacheSet(canonical, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
