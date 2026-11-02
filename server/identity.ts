/**
 * Lightweight local identity for the single-agent runtime.
 *
 * Polymax does not ship external auth. Each browser/device receives a stable,
 * anonymous user id that scopes its agent thread, so two users on the same
 * server never share a transcript. The id is opaque and never used for
 * authentication or authorization: filesystem and tool grants still enforce
 * their own boundaries.
 */

export const DEFAULT_USER_ID = "local";

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Returns a safe, bounded user id. Unknown or malformed values fall back to
 * the local single-user id instead of failing the request.
 */
export function sanitizeUserId(raw?: string | null): string {
  if (typeof raw !== "string") return DEFAULT_USER_ID;

  const trimmed = raw.trim();
  if (!USER_ID_PATTERN.test(trimmed)) return DEFAULT_USER_ID;

  return trimmed;
}

/**
 * Resolves the caller's user id for an explicit deploy mode (#191 slice 1).
 * Local mode always returns the fixed owner so every request scopes to the
 * single-user demo identity; cloud mode keeps the header/query/body logic
 * (session enforcement itself is fork-only per ADR 0002).
 */
export function resolveUserIdForMode(
  input: { header?: string | null; query?: string | null; body?: unknown },
  mode: "local" | "cloud" = "local"
): string {
  if (mode === "local") return DEFAULT_USER_ID;
  return resolveUserId(input);
}

/**
 * Resolves the caller's user id from the request header, then the query
 * string, then an optional body value, falling back to {@link DEFAULT_USER_ID}.
 */
export function resolveUserId(input: {
  header?: string | null;
  query?: string | null;
  body?: unknown;
}): string {
  const bodyUserId = typeof input.body === "string" ? input.body : undefined;
  return sanitizeUserId(input.header || input.query || bodyUserId);
}
