import { useCallback, useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Membership {
  workspaceId: string;
  workspaceName: string;
  role: string;
  createdAt: string;
}

interface Providers {
  google: boolean;
  github: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function AccountSettingsView() {
  const { data: sessionData, isPending, refetch } = useSession();
  const user = sessionData?.user as
    | { id: string; name: string; email: string; emailVerified: boolean; image?: string | null }
    | undefined;

  const [providers, setProviders] = useState<Providers>({ google: false, github: false });
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [sessions, setSessions] = useState<Array<{ token: string; createdAt: string; userAgent?: string; current?: boolean }>>([]);
  const [accounts, setAccounts] = useState<Array<{ providerId: string; accountId: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Sign-in / sign-up form state (local mode: hidden until the user opts in)
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Profile / email / password state
  const [displayName, setDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  const say = (ok: boolean, text: string) => setNotice({ ok, text });

  const refresh = useCallback(async () => {
    try {
      const st = await fetch("/api/account/status", { credentials: "include" }).then((r) => r.json());
      if (st?.providers) setProviders(st.providers);
    } catch {
      // Local-first: account endpoints are optional.
    }
    try {
      const ms = await fetch("/api/account/memberships", { credentials: "include" }).then((r) => r.json());
      if (Array.isArray(ms?.memberships)) setMemberships(ms.memberships);
    } catch {
      // ignore
    }
    try {
      const { data } = await authClient.listSessions();
      if (Array.isArray(data)) setSessions(data as any);
    } catch {
      // ignore when signed out
    }
    try {
      const { data } = await (authClient as any).listAccounts?.() ?? { data: [] };
      if (Array.isArray(data)) setAccounts(data as any);
    } catch {
      // ignore
    }
    await refetch().catch(() => {});
  }, [refetch]);

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) setResetToken(token);
  }, [refresh]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.name ?? "");
      setNewEmail("");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<{ error?: { message?: string } | null } | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const res = (await fn()) as { error?: { message?: string } | null } | undefined;
      if (res?.error) {
        say(false, res.error.message || "Request failed.");
      } else {
        await refresh();
      }
    } catch (err: any) {
      say(false, err?.message || "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Checking account status…</p>;
  }

  // ---- Signed-out: compact local row, form expands in place (#326) ----
  if (!user) {
    if (!showAuthForm) {
      return (
        <div className="grid gap-2 px-1 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Local workspace</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No account — everything stays on this device.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAuthForm(true)}>
              Sign in / Create account
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="grid gap-4">
        <div className="px-1 py-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Local workspace</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowAuthForm(false)}>
              Dismiss
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            You are using PolyDocks without an account. Your workspace, plugins and conversations
            stay on this device. Create an account to get an identity, own isolated workspaces,
            and manage sessions across devices later.
          </p>
        </div>
        <div className="grid gap-3 px-1 py-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "signin" ? "default" : "outline"}
              onClick={() => setMode("signin")}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              variant={mode === "signup" ? "default" : "outline"}
              onClick={() => setMode("signup")}
            >
              Create account
            </Button>
          </div>
          {mode === "signup" && (
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
            </Field>
          )}
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          {notice && <p className={`text-sm ${notice.ok ? "text-[var(--accent-lime)]" : "text-destructive"}`}>{notice.text}</p>}
          <div className="flex flex-wrap gap-2">
            {mode === "signup" ? (
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run("signup", async () => {
                    const res = await authClient.signUp.email({ name: name.trim() || "PolyDocks User", email: email.trim(), password });
                    if (!res.error) say(true, "Account created. Check your email to verify it.");
                    return res;
                  })
                }
              >
                {busy === "signup" ? "Creating…" : "Create account"}
              </Button>
            ) : (
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run("signin", async () => {
                    const res = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
                    if (!res.error) say(true, "Signed in.");
                    return res;
                  })
                }
              >
                {busy === "signin" ? "Signing in…" : "Sign in"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!email.includes("@") || busy !== null}
              onClick={() =>
                run("reset-request", async () => {
                  const res = await authClient.requestPasswordReset({
                    email: email.trim(),
                    redirectTo: `${window.location.origin}/settings`,
                  });
                  if (!res.error) say(true, "If the email exists, a reset link is on its way.");
                  return res;
                })
              }
            >
              Forgot password?
            </Button>
          </div>
          {(providers.google || providers.github) && (
            <div className="flex flex-wrap gap-2">
              {providers.google && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/settings" })}
                >
                  Continue with Google
                </Button>
              )}
              {providers.github && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/settings" })}
                >
                  Continue with GitHub
                </Button>
              )}
            </div>
          )}
          {resetToken && (
            <div className="grid gap-2 rounded-md border p-3">
              <p className="text-sm font-medium">Set a new password</p>
              <Field label="New password">
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run("reset-confirm", async () => {
                    const res = await authClient.resetPassword({ newPassword, token: resetToken });
                    if (!res.error) {
                      say(true, "Password reset. You can sign in now.");
                      setResetToken(null);
                    }
                    return res;
                  })
                }
              >
                Save new password
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const linked = new Set(accounts.map((a) => a.providerId));
  // ---- Signed-in: full account management ----
  return (
    <div className="grid gap-4">
      {notice && (
        <p className={`text-sm ${notice.ok ? "text-[var(--accent-lime)]" : "text-destructive"}`}>{notice.text}</p>
      )}

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Profile</h3>
        <Field label="Name">
          <div className="flex gap-2">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Button
              size="sm"
              disabled={busy !== null || displayName.trim() === (user.name ?? "")}
              onClick={() =>
                run("profile", async () => {
                  const res = await authClient.updateUser({ name: displayName.trim() });
                  if (!res.error) say(true, "Profile updated.");
                  return res;
                })
              }
            >
              Save
            </Button>
          </div>
        </Field>
        <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>
      </section>

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Email</h3>
        <p className="text-sm">
          {user.email}{" "}
          {user.emailVerified ? (
            <span className="text-[var(--accent-lime)]">(verified)</span>
          ) : (
            <span className="text-amber-500">(unverified)</span>
          )}
        </p>
        {!user.emailVerified && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run("verify", async () => {
                const res = await authClient.sendVerificationEmail({
                  email: user.email,
                  callbackURL: "/settings",
                });
                if (!res.error) say(true, "Verification email sent.");
                return res;
              })
            }
          >
            Resend verification email
          </Button>
        )}
        <Field label="Change email">
          <div className="flex gap-2">
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" />
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || !newEmail.includes("@")}
              onClick={() =>
                run("change-email", async () => {
                  const res = await (authClient as any).changeEmail({ newEmail: newEmail.trim(), callbackURL: "/settings" });
                  if (!res.error) say(true, "Confirm the new address from its inbox.");
                  return res;
                })
              }
            >
              Change
            </Button>
          </div>
        </Field>
      </section>

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Connected accounts</h3>
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">Password sign-in only.</p>}
        {accounts.map((a) => (
          <div key={`${a.providerId}:${a.accountId}`} className="flex items-center justify-between text-sm">
            <span className="capitalize">{a.providerId}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run(`unlink-${a.providerId}`, async () => {
                  const res = await (authClient as any).unlinkAccount({ providerId: a.providerId });
                  if (!res.error) say(true, `${a.providerId} disconnected.`);
                  return res;
                })
              }
            >
              Disconnect
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {providers.google && !linked.has("google") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (authClient as any).linkSocial({ provider: "google", callbackURL: "/settings" })}
            >
              Connect Google
            </Button>
          )}
          {providers.github && !linked.has("github") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (authClient as any).linkSocial({ provider: "github", callbackURL: "/settings" })}
            >
              Connect GitHub
            </Button>
          )}
          {!providers.google && !providers.github && (
            <p className="text-xs text-muted-foreground">
              Social sign-in is disabled: no OAuth credentials configured (see .env.example).
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Password</h3>
        <Field label="Current password">
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        <Field label="New password">
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy !== null || !currentPassword || newPassword.length < 8}
            onClick={() =>
              run("change-password", async () => {
                const res = await authClient.changePassword({
                  currentPassword,
                  newPassword,
                  revokeOtherSessions: true,
                });
                if (!res.error) {
                  say(true, "Password changed; other sessions revoked.");
                  setCurrentPassword("");
                  setNewPassword("");
                }
                return res;
              })
            }
          >
            Change password
          </Button>
        </div>
      </section>

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Active sessions</h3>
        {sessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions found.</p>}
        {sessions.map((s) => (
          <div key={s.token} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-xs text-muted-foreground">
              {new Date(s.createdAt).toLocaleString()}
              {s.userAgent ? ` · ${s.userAgent.slice(0, 48)}` : ""}
              {s.current ? " · this device" : ""}
            </span>
            {!s.current && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  run(`revoke-${s.token.slice(0, 8)}`, async () => {
                    const res = await authClient.revokeSession({ token: s.token });
                    if (!res.error) say(true, "Session revoked.");
                    return res;
                  })
                }
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run("revoke-all", async () => {
                const res = await authClient.revokeSessions();
                if (!res.error) say(true, "Signed out everywhere.");
                return res;
              })
            }
          >
            Sign out everywhere
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => run("signout", () => authClient.signOut())}
          >
            Sign out
          </Button>
        </div>
      </section>

      <section className="grid gap-3 px-1 py-2">
        <h3 className="text-sm font-semibold">Workspace membership</h3>
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No owned workspaces yet. Workspaces you create while signed in appear here.
          </p>
        )}
        {memberships.map((m) => (
          <div key={m.workspaceId} className="flex items-center justify-between text-sm">
            <span>{m.workspaceName}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{m.role}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-3 rounded-lg border border-destructive/40 p-4">
        <h3 className="text-sm font-semibold text-destructive">Account security</h3>
        <p className="text-xs text-muted-foreground">
          Deleting your account removes your identity. Workspaces you own become device-local;
          nothing else is deleted.
        </p>
        <div>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm("Delete your PolyDocks account? This cannot be undone.")) return;
              void run("delete", async () => {
                const res = await (authClient as any).deleteUser();
                if (!res.error) say(true, "Account deleted.");
                return res;
              });
            }}
          >
            Delete account
          </Button>
        </div>
      </section>

      <Separator />
    </div>
  );
}
