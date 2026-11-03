import { betterAuth } from "better-auth";
import { config } from "../config";
import { db } from "../workspace/db";

/**
 * Outbound auth email record. Local-first delivery strategy:
 * - SMTP configured (SMTP_HOST set) -> hook point for a future mailer;
 *   today we still log the link and keep it in the outbox so the flow is
 *   observable without adding a mail dependency.
 * - SMTP unconfigured -> log the link server-side (dev) and keep it in the
 *   outbox. Tests import `readAuthOutbox()` to complete verify/reset flows
 *   without credentials.
 *
 * Never throws: email delivery must never break signup/signin.
 */
export interface AuthOutboxEntry {
  to: string;
  subject: string;
  url: string;
  kind: "verification" | "reset" | "other";
  createdAt: string;
}

const outbox: AuthOutboxEntry[] = [];

export function readAuthOutbox(): AuthOutboxEntry[] {
  return [...outbox];
}

export function clearAuthOutbox(): void {
  outbox.length = 0;
}

function queueAuthEmail(entry: Omit<AuthOutboxEntry, "createdAt">): void {
  try {
    outbox.push({ ...entry, createdAt: new Date().toISOString() });
    // Keep the outbox bounded; auth links are short-lived by design.
    if (outbox.length > 50) outbox.splice(0, outbox.length - 50);
    console.log(`[PolyDocks Auth] ${entry.kind} email for ${entry.to}: ${entry.url}`);
  } catch {
    // Non-fatal telemetry: never break the auth flow on logging.
  }
}

function resolveSecret(): string {
  const raw = (config.BETTER_AUTH_SECRET || "").trim();
  if (raw.length > 0) return raw;
  if (config.NODE_ENV === "production") {
    throw new Error(
      "[FATAL] BETTER_AUTH_SECRET is required in production. Set it in the environment (see .env.example)."
    );
  }
  // Dev/test fallback only. Stable per process so sessions survive reload
  // in the same run; never used in production (guarded above).
  console.warn("[PolyDocks Auth] BETTER_AUTH_SECRET is unset; using an ephemeral dev secret.");
  return "dev-only-ephemeral-secret-change-me-32-chars!!";
}

function resolveTrustedOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const base = (config.BETTER_AUTH_URL || "").trim();
  if (base) {
    try {
      const u = new URL(base);
      origins.add(u.origin);
    } catch {
      // Ignore malformed BETTER_AUTH_URL here; zod url() validation is
      // intentionally loose (optional string) so local boot never breaks.
    }
  }
  return [...origins];
}

/**
 * Better Auth instance: the single identity foundation for PolyDocks.
 *
 * - Database: the shared bun:sqlite `polymax.db` (same file, same WAL
 *   strategy as the rest of the backend). Tables (`user`, `session`,
 *   `account`, `verification`) are created by `ensureAuthTables()` via
 *   Better Auth's own migration planner (additive only, reversible by
 *   dropping the four tables).
 * - Email/password enabled. Email verification links and password-reset
 *   links are issued; delivery is the dev outbox until SMTP lands.
 *   `requireEmailVerification` stays false so local-first signup is never
 *   blocked before mail delivery exists (one-flag flip documented in
 *   internal-docs/auth.md).
 * - Google/GitHub OAuth mount only when BOTH id and secret are present,
 *   so local development never requires social credentials.
 * - No organization plugin: workspace ownership is PolyDocks-owned
 *   (`workspace_members`, see membership.ts), not Better Auth orgs.
 * - No passkey/2FA plugins yet: reserved for a follow-up (see internal-docs/auth.md).
 */
export const auth = betterAuth({
  secret: resolveSecret(),
  baseURL: (config.BETTER_AUTH_URL || "").trim() || undefined,
  trustedOrigins: resolveTrustedOrigins(),
  database: db as any,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      queueAuthEmail({
        to: user.email,
        subject: "Reset your PolyDocks password",
        url,
        kind: "reset",
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      queueAuthEmail({
        to: user.email,
        subject: "Verify your PolyDocks email",
        url,
        kind: "verification",
      });
    },
  },
  socialProviders: {
    ...(config.GOOGLE_CLIENT_ID.trim() && config.GOOGLE_CLIENT_SECRET.trim()
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID.trim(),
            clientSecret: config.GOOGLE_CLIENT_SECRET.trim(),
          },
        }
      : {}),
    ...(config.GITHUB_CLIENT_ID.trim() && config.GITHUB_CLIENT_SECRET.trim()
      ? {
          github: {
            clientId: config.GITHUB_CLIENT_ID.trim(),
            clientSecret: config.GITHUB_CLIENT_SECRET.trim(),
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
});

/**
 * Non-secret summary for health checks and the audit log. Never leaks keys.
 */
export function getAuthConfigSummary(): {
  emailPassword: boolean;
  google: boolean;
  github: boolean;
  emailDelivery: "smtp-log" | "dev-log";
  requireEmailVerification: boolean;
} {
  return {
    emailPassword: true,
    google: Boolean(config.GOOGLE_CLIENT_ID.trim() && config.GOOGLE_CLIENT_SECRET.trim()),
    github: Boolean(config.GITHUB_CLIENT_ID.trim() && config.GITHUB_CLIENT_SECRET.trim()),
    emailDelivery: config.SMTP_HOST.trim() ? "smtp-log" : "dev-log",
    requireEmailVerification: false,
  };
}
