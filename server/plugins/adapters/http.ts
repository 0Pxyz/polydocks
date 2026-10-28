import type { ExecutionContext } from "../bus";
import { HttpAdapterConfigSchema } from "./types";

/**
 * Resolve a nested property from an object using dot notation (e.g. "article.title" or "title").
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }
  const parts = path.split(".");
  let curr: any = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Interpolate {var} or {nested.var} tokens in a template string using properties from input.
 */
export function interpolateString(template: string, input: unknown, urlEncode = false): string {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    const val = getNestedValue(input, key);
    if (val === undefined || val === null) {
      return match;
    }
    const str = String(val);
    return urlEncode ? encodeURIComponent(str) : str;
  });
}

/**
 * Recursively interpolate template tokens in an object or array.
 */
function interpolateObject(data: unknown, input: unknown): unknown {
  if (typeof data === "string") {
    return interpolateString(data, input, false);
  }
  if (Array.isArray(data)) {
    return data.map((item) => interpolateObject(item, input));
  }
  if (data !== null && typeof data === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      res[k] = interpolateObject(v, input);
    }
    return res;
  }
  return data;
}

/**
 * Declarative HTTP capability executor.
 * Strictly uses SSRF-guarded and size-capped ctx.fetch.
 */
export async function executeHttpAdapter(
  rawConfig: unknown,
  input: unknown,
  ctx: ExecutionContext
): Promise<unknown> {
  const parseResult = HttpAdapterConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    throw new Error(`Invalid HTTP adapter configuration: ${parseResult.error.message}`);
  }
  const config = parseResult.data;

  // 1. Resolve and interpolate URL
  const interpolatedUrlStr = interpolateString(config.urlTemplate, input, true);
  let targetUrl: URL;
  try {
    targetUrl = new URL(interpolatedUrlStr);
  } catch (err: any) {
    throw new Error(`Invalid URL constructed from template "${config.urlTemplate}": ${err.message}`);
  }

  // 2. Append query parameters if declared
  if (config.queryParams) {
    for (const [k, v] of Object.entries(config.queryParams)) {
      const interpolatedVal = interpolateString(v, input, false);
      if (interpolatedVal && !interpolatedVal.startsWith("{")) {
        targetUrl.searchParams.set(k, interpolatedVal);
      }
    }
  }

  // 3. Assemble headers and inject secrets
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    ...config.headers,
  };

  // Interpolate header values
  for (const [hk, hv] of Object.entries(headers)) {
    headers[hk] = interpolateString(hv, input, false);
  }

  if (config.bearerSecret) {
    const secretValue = ctx.secrets?.get(config.bearerSecret) || process.env[config.bearerSecret];
    if (secretValue) {
      headers.Authorization = `Bearer ${secretValue}`;
    }
  }

  // 4. Assemble request body for write methods
  let body: string | undefined;
  const method = config.method;
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    if (config.bodyTemplate) {
      if (typeof config.bodyTemplate === "string") {
        body = interpolateString(config.bodyTemplate, input, false);
      } else {
        const interpolatedBody = interpolateObject(config.bodyTemplate, input);
        body = JSON.stringify(interpolatedBody);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    } else if (input && typeof input === "object") {
      body = JSON.stringify(input);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  // 5. Execute request through SSRF-guarded fetch
  if (!ctx.fetch) {
    throw new Error("Scoped fetch context is missing from execution environment.");
  }

  const response = await ctx.fetch(targetUrl.toString(), {
    method,
    headers,
    body,
    maxBytes: config.byteCap,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `HTTP request failed with status ${response.status} (${response.statusText}): ${errText.slice(0, 500)}`
    );
  }

  // 6. Parse response
  const contentType = response.headers.get("content-type") || "";
  let data: unknown;

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } else {
    data = await response.text();
  }

  // 7. Extract sub-path if requested
  if (config.responsePath && data !== null && typeof data === "object") {
    const extracted = getNestedValue(data, config.responsePath);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  return data;
}
