import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { getModelForRole, modelError, type ModelRole } from "../agent/modelRegistry";

export interface GeneratedImage {
  ok: true;
  /** Absolute file path of the verified cached image. */
  path: string;
  /** Relative URL the dock can render (served from DATA_DIR cache). */
  url: string;
  prompt: string;
  model: string;
  bytes: number;
  cached: boolean;
}

export interface ImageFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean; role: ModelRole };
}

export type ImageResult = GeneratedImage | ImageFailure;

function cacheDir(): string {
  return path.resolve(config.DATA_DIR, "image-cache");
}

function cacheKey(prompt: string, size: string, outputFormat: string): string {
  return crypto.createHash("sha256").update(`${prompt}\n${size}\n${outputFormat}`).digest("hex").slice(0, 32);
}

/**
 * Generate a cover / share-card image with Muse Image.
 * Endpoint: POST {baseURL}/images/generations (OpenAI Images compatible).
 * Never returns success without a verified file on disk (exists + size > 0).
 * Async callers should run this as a background task; it can take 10-60s.
 */
export async function generateImage(input: {
  prompt: string;
  size?: string;
  outputFormat?: "webp" | "png" | "jpeg";
  fetchImpl?: typeof fetch;
}): Promise<ImageResult> {
  const role: ModelRole = "image";
  const resolved = getModelForRole(role);
  if (!resolved.configured) {
    return modelError(role, "image_not_configured", "Muse Image is not configured (missing MODEL_API_KEY).", false);
  }
  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    return modelError(role, "invalid_prompt", "Prompt must not be empty.", false);
  }
  if (prompt.length > 4000) {
    return modelError(role, "invalid_prompt", "Prompt exceeds 4000 characters.", false);
  }
  const size = input.size ?? "1024x1024";
  const outputFormat = input.outputFormat ?? "webp";
  const key = cacheKey(prompt, size, outputFormat);
  const filename = `${key}.${outputFormat}`;
  const dir = cacheDir();
  const absPath = path.join(dir, filename);

  // Cache hit: verify before claiming success.
  try {
    const stat = await fs.stat(absPath);
    if (stat.size > 0) {
      return {
        ok: true,
        path: absPath,
        url: `/api/media/image-cache/${filename}`,
        prompt,
        model: resolved.modelId,
        bytes: stat.size,
        cached: true,
      };
    }
  } catch {
    // Cache miss: fall through to generation.
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${resolved.baseURL.replace(/\/$/, "")}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.modelId,
        prompt,
        n: 1,
        size,
        response_format: "b64_json",
        output_format: outputFormat,
      }),
    });
  } catch (err: any) {
    return modelError(role, "image_transport_error", `Image request failed: ${err?.message || err}`, true);
  }

  if (res.status === 429 || res.status === 503) {
    return modelError(role, "image_retryable", `Muse Image busy (HTTP ${res.status}). Retry with backoff.`, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "").then((t) => t.slice(0, 500));
    const retryable = res.status >= 500;
    return modelError(role, "image_request_failed", `Muse Image returned HTTP ${res.status}: ${text}`, retryable);
  }

  let body: any = {};
  try {
    body = await res.json();
  } catch {
    return modelError(role, "image_bad_response", "Muse Image returned non-JSON.", true);
  }
  const b64: unknown = body?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    if (typeof body?.data?.[0]?.url === "string" && body.data[0].url.length > 0) {
      return modelError(
        role,
        "image_url_not_cached",
        "Muse Image returned a signed URL instead of bytes; refetch with response_format b64_json.",
        false
      );
    }
    return modelError(role, "image_empty_result", "Muse Image returned no image bytes.", true);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return modelError(role, "image_bad_bytes", "Muse Image returned undecodable bytes.", true);
  }
  if (bytes.length === 0) {
    return modelError(role, "image_empty_result", "Muse Image returned zero bytes.", true);
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absPath, bytes);
  } catch (err: any) {
    return modelError(role, "image_cache_write_failed", `Could not cache image: ${err?.message || err}`, false);
  }

  // Post-condition: verify before ok:true.
  try {
    const stat = await fs.stat(absPath);
    if (stat.size === 0) {
      return modelError(role, "image_empty_result", "Cached image is empty.", false);
    }
    return {
      ok: true,
      path: absPath,
      url: `/api/media/image-cache/${filename}`,
      prompt,
      model: resolved.modelId,
      bytes: stat.size,
      cached: false,
    };
  } catch {
    return modelError(role, "image_cache_write_failed", "Cached image missing after write.", false);
  }
}
