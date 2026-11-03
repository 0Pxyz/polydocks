import { config } from "./config";

/**
 * Public/internal error boundary (#322). Internal failures are logged
 * server-side with full detail; clients receive a generic message unless
 * the server explicitly runs in development. Fail-closed: anything that
 * is not development behaves like production.
 */
export function isDev(): boolean {
  return config.NODE_ENV === "development";
}

/** Log the internal error server-side; returns nothing. */
export function logInternal(scope: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[${scope}] ${detail}`);
}

/**
 * Client-safe message for expected-failure paths (4xx): the raw message
 * in development, a generic fallback in production. No stack, no codes.
 */
export function safeMessage(err: unknown, fallback: string): string {
  if (isDev()) return err instanceof Error ? err.message : String(err);
  return fallback;
}
/**
 * 500 envelope for unexpected failures. Production shape carries no
 * mechanics: { error: fallback }. Development appends the raw message.
 */
export function internalError(
  scope: string,
  err: unknown,
  fallback = "Something went wrong"
): { body: Record<string, unknown>; status: 500 } {
  logInternal(scope, err);
  if (isDev()) {
    return {
      body: {
        error: err instanceof Error ? err.message : String(err),
        detail: fallback,
      },
      status: 500,
    };
  }
  return { body: { error: fallback }, status: 500 };
}
