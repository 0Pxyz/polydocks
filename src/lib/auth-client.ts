import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth client. Same-origin by default: the API lives under
 * /api on the same host in dev (Vite proxy) and in production (single
 * Bun process), so cookies are first-party and no baseURL is needed.
 */
export const authClient = createAuthClient();

export const { useSession } = authClient;
