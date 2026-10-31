/**
 * Server-verified receipts: at the end of each turn, compare the final
 * answer against the ok:true envelopes the turn actually produced.
 * If the model claims an install, approval or creation with no matching
 * receipt, the turn is flagged (R13b regression: invented install +
 * invented approval). Pure function — unit-testable without a model.
 */

export interface TurnReceipt {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** Slug-like tokens found in args + result (ids, versions, plugin names). */
  ids: string[];
  /**
   * Completion evidence this single receipt carries. Aggregated by
   * summarizeCompletion into the turn's Updated / Mounted / Verified /
   * Failed levels — the only claims the final answer may make.
   */
  evidence?: {
    updated?: boolean;
    mounted?: boolean;
    /** inspect_experience ok with isHealthy true and verification ok. */
    verifiedHealthy?: boolean;
  };
}

/** Completion levels a turn can honestly claim (Phase 2, issue #170). */
export interface CompletionSummary {
  /** A write returned ok (create/modify). Code changed — nothing more. */
  updated: boolean;
  /** An open/install/operate ran ok. Dispatched — the guest may still fail. */
  mounted: boolean;
  /** A healthy read-back exists: inspect ok, isHealthy, verification ok. */
  verified: boolean;
  /** Tools that returned ok:false in families that decide completion. */
  failed: string[];
}

/** Tools whose ok receipt means code changed. */
const WRITE_TOOLS = [
  "create_plugin",
  "modify_plugin",
  "create_tab",
  "update_tab",
  "plugins.create",
  "plugins.edit",
];

/** Tools whose ok receipt means an open/install/operate was dispatched. */
const MOUNT_TOOLS = [
  "open_tab",
  "open_intent",
  "operate_plugin",
  "install_plugin",
  "dock.open",
  "plugins.install",
  "plugins.operate",
];

/** Tools whose failure decides completion (write, mount, verify, publish). */
const DECIDING_TOOLS = [
  ...WRITE_TOOLS,
  ...MOUNT_TOOLS,
  "inspect_experience",
  "publish_plugin",
  "plugins.publish",
  "rollback",
];

function toolIn(tool: string, family: string[]): boolean {
  return family.some((t) => tool === t || tool.includes(t));
}

export interface ReceiptIssue {
  sentence: string;
  reason: string;
}

const SLUG_RE = /\b[a-z0-9]+(?:[-_][a-z0-9]+)+\b/gi;

function slugTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(SLUG_RE)) {
    const t = m[0].toLowerCase();
    if (t.length >= 4) out.add(t);
  }
  return [...out];
}

export function collectReceipt(tool: string, args: unknown, output: unknown): TurnReceipt {
  const o = output as any;
  // Fail closed: approval-gated operations never count as success, even if a
  // caller wraps them in a success envelope.
  const gated =
    o?.code === "approval_required" ||
    o?.status === "approval_required" ||
    (typeof o?.error === "string" && o.error.toLowerCase().includes("approval")) ||
    (typeof o?.message === "string" && o.message.toLowerCase().includes("approval required"));
  const ok = (o?.ok === true || o?.success === true) && !gated;
  const blob = `${JSON.stringify(args ?? {})}\n${typeof output === "string" ? output : JSON.stringify(output ?? {})}`;
  const evidence: NonNullable<TurnReceipt["evidence"]> = {};
  if (ok && toolIn(tool, WRITE_TOOLS)) evidence.updated = true;
  if (ok && toolIn(tool, MOUNT_TOOLS)) evidence.mounted = true;
  // Healthy read-back: inspect_experience ok with no recorded errors and a
  // passing static verification. This is "loads successfully" evidence —
  // never pixel truth (no tool inspects the rendered screen).
  const exp = (o as any)?.experience;
  if (ok && tool === "inspect_experience" && exp?.isHealthy === true && exp?.verification?.ok === true) {
    evidence.verifiedHealthy = true;
  }
  return {
    tool,
    args: (args as Record<string, unknown>) ?? {},
    ok,
    ids: slugTokens(blob),
    evidence: Object.keys(evidence).length > 0 ? evidence : undefined,
  };
}

/**
 * Aggregates a turn's receipts into the four completion levels. Pure —
 * the loop never interprets envelopes ad hoc; tests pin the mapping.
 */
export function summarizeCompletion(receipts: TurnReceipt[]): CompletionSummary {
  const failed: string[] = [];
  let updated = false;
  let mounted = false;
  let verified = false;
  for (const r of receipts) {
    if (!r.ok && toolIn(r.tool, DECIDING_TOOLS)) failed.push(r.tool);
    if (!r.ok) continue;
    if (r.evidence?.updated) updated = true;
    if (r.evidence?.mounted) mounted = true;
    if (r.evidence?.verifiedHealthy) verified = true;
  }
  return { updated, mounted, verified, failed };
}

const HIGH_STAKES: Array<{ verbs: RegExp; tools: string[]; label: string }> = [
  {
    verbs: /\b(install(?:ed|ing|s)?|instala(?:do|dos|r|dos|ção)?)\b/i,
    tools: ["plugins.install", "installFromRegistry", "addPluginToWorkspace"],
    label: "install",
  },
  {
    verbs: /\b(creat(?:ed|es|ing)?|cria(?:do|dos|r|dos|ção)?)\b/i,
    tools: ["plugins.create", "create_plugin", "create_tab"],
    label: "create",
  },
  {
    verbs: /\b(publish(?:ed|ing|es)?|publica(?:do|dos|r|dos|ção)?)\b/i,
    tools: ["plugins.publish", "publish_plugin"],
    label: "publish",
  },
  {
    verbs: /\b(uninstall(?:ed|s)?|desinstala(?:do|dos|r)?)\b/i,
    tools: ["plugins.uninstall"],
    label: "uninstall",
  },
  {
    verbs: /\b(rolled back|revert(?:ed|i)?|revert(?:eu|este)?)\b/i,
    tools: ["plugin.updated", "rollback"],
    label: "rollback",
  },
];

const APPROVAL_CLAIM = /\b(you approved|with your approval|as you approved|you (?:said yes|confirmed|gave (?:the )?go-ahead)|você aprova|com sua aprova|aprovad[oa] por você)\b/i;
const APPROVAL_EVIDENCE = /\b(yes|yeah|yep|go ahead|approved|approve|do it|confirmed|confirm|sim|pode|pode fazer|faz|aprovado|aprovada|aprovo|confirmado|ok\b|okay)\b/i;

/**
 * Completion-level claims (Phase 2, issue #170): Updated / Mounted /
 * Verified / Failed. A write ok means updated; an open ok means dispatched,
 * not rendered; only a healthy read-back (inspect ok, isHealthy,
 * verification ok) supports "ready" or "loads successfully". Pixel truth
 * never exists — no tool inspects the rendered screen — so visual claims
 * always fail. Tiers apply only in turns that ran tools, so ordinary chat
 * ("I'm ready to help") is never policed.
 */
const VISUAL_CLAIMS =
  /\b(visually verified|visually confirmed|renders? correctly|rendered correctly|looks perfect|pixel.?perfect|screenshots? (confirmed|verified))\b/i;
const LOAD_CLAIMS =
  /\b(loads? successfully|loaded successfully|is live|are live|fixed and (working|verified)|confirmed working|works? as expected|working (fine|correctly))\b/i;
const READY_CLAIMS =
  /\b((is|are|está|estão) (ready|live)|ready to use|ready in your (dock|workspace)|pronto para usar)\b/i;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Not every verb mention is a completion claim (#154 false positive).
 * Questions, negations, future intentions and conditionals describe what
 * was NOT done, what MIGHT be done, or what the user should decide —
 * flagging them punishes honest answers ("I don't install anything
 * without your explicit yes", "Want me to install…?"). Only affirmative
 * statements about this turn's outcome are claims. Only the text BEFORE
 * the verb counts: "Installed without issues" still claims (the cue
 * follows the verb), while "I won't install" never does. The R13b
 * transcript stays flagged: its install sentence is affirmative past
 * tense with no matching receipt.
 */
const QUESTION_MARK = /\?/;
const NON_CLAIM_PREFIX =
  /\b(don'?t|doesn'?t|didn'?t|won'?t|wouldn'?t|can'?t|couldn'?t|shouldn'?t|do not|does not|did not|will not|would not|cannot|can not|could not|can|could|never|not|without|want me to|would you like|should i|shall i|do you want|if|unless|when|going to|will|would|shall|might)\b/i;

function isCompletionClaim(sentence: string, verbIndex: number): boolean {
  if (QUESTION_MARK.test(sentence)) return false;
  return !NON_CLAIM_PREFIX.test(sentence.slice(0, verbIndex));
}

function claimedVerbIndex(sentence: string, verbs: RegExp): number {
  for (const m of sentence.matchAll(new RegExp(verbs.source, "gi"))) {
    const at = m.index ?? 0;
    if (isCompletionClaim(sentence, at)) return at;
  }
  return -1;
}

export function verifyReceipts(
  finalText: string,
  userPrompt: string,
  receipts: TurnReceipt[]
): { ok: boolean; issues: ReceiptIssue[] } {
  const issues: ReceiptIssue[] = [];
  const okReceipts = receipts.filter((r) => r.ok);
  const receiptIds = new Set<string>();
  for (const r of okReceipts) for (const id of r.ids) receiptIds.add(id);
  // Ids the user already named are context, not claims.
  const contextIds = new Set(slugTokens(userPrompt));
  const completion = summarizeCompletion(receipts);
  const turnRanTools = receipts.length > 0;

  for (const sentence of splitSentences(finalText)) {
    for (const rule of HIGH_STAKES) {
      if (claimedVerbIndex(sentence, rule.verbs) < 0) continue;
      const familyHit = okReceipts.some((r) =>
        rule.tools.some((t) => r.tool === t || r.tool.includes(t))
      );
      if (!familyHit) {
        issues.push({ sentence: sentence.slice(0, 160), reason: `claims ${rule.label} but no ${rule.label} tool returned ok:true this turn` });
        continue;
      }
      // Named ids must appear in some ok receipt (prompt ids are context).
      for (const id of slugTokens(sentence)) {
        if (contextIds.has(id)) continue;
        if (!receiptIds.has(id) && !/^(v?\d+\.)?\d+\.\d+/.test(id)) {
          issues.push({ sentence: sentence.slice(0, 160), reason: `names "${id}" with no matching receipt` });
          break;
        }
      }
    }
    if (APPROVAL_CLAIM.test(sentence) && !APPROVAL_EVIDENCE.test(userPrompt)) {
      issues.push({ sentence: sentence.slice(0, 160), reason: "claims user approval with no approval in the user turn" });
    }
    if (!turnRanTools) continue;
    // Completion levels: Updated (write ok) < Mounted (open dispatched) <
    // Verified (healthy read-back). Claiming above the evidence fails.
    if (claimedVerbIndex(sentence, VISUAL_CLAIMS) >= 0) {
      issues.push({ sentence: sentence.slice(0, 160), reason: "claims visual verification, which no tool can confirm" });
    } else if (claimedVerbIndex(sentence, LOAD_CLAIMS) >= 0) {
      if (!completion.verified) {
        issues.push({ sentence: sentence.slice(0, 160), reason: "claims verified load without a healthy read-back (inspect_experience isHealthy + verification ok)" });
      }
    } else if (claimedVerbIndex(sentence, READY_CLAIMS) >= 0) {
      if (!completion.verified) {
        issues.push({ sentence: sentence.slice(0, 160), reason: "calls it ready without confirming it opens (healthy read-back required)" });
      }
    }
    // Failed level: success language about a turn that recorded a failure
    // in a deciding tool. Independent failures stay reportable; claiming
    // completion over them does not.
    if (completion.failed.length > 0) {
      const claimsCompletion =
        HIGH_STAKES.some((r) => claimedVerbIndex(sentence, r.verbs) >= 0) ||
        claimedVerbIndex(sentence, LOAD_CLAIMS) >= 0 ||
        claimedVerbIndex(sentence, READY_CLAIMS) >= 0;
      if (claimsCompletion) {
        issues.push({ sentence: sentence.slice(0, 160), reason: `claims completion but the turn recorded a failure in ${completion.failed[0]}` });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
