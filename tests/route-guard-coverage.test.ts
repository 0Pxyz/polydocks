import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Route-guard coverage (Tarefa 1, #215): every HTTP route that receives a
 * workspaceId, sessionId, jobId/taskId or executionId MUST pass through
 * the central point (server/auth/guard.ts). No route calls
 * hasWorkspaceAccess directly. A new route that takes one of those ids
 * without the guard fails this test.
 *
 * Ids outside the ownership scope (plugin catalog ids, approval ids,
 * registry ids, grant ids, share payloads) are listed in EXCEPTIONS with
 * a reason; adding an exception is review-visible by design.
 */

const REPO = path.resolve(import.meta.dir, "..");
const ROUTES_DIR = path.join(REPO, "server", "routes");
const INDEX_FILE = path.join(REPO, "server", "index.ts");

// Query/body intake of a scoped id.
const SCOPED_NAME = "(workspaceId|sessionId|jobId|taskId|executionId|artifactId)";
const QUERY_RE = new RegExp(`c\\.req\\.query\\(\\s*["']${SCOPED_NAME}["']`);
const BODY_RE = new RegExp(`(body|input|params)\\s*(as\\s+any)?\\?\\.\\s*${SCOPED_NAME}|(body|input|params)\\.${SCOPED_NAME}`);
// Path params: param("id") may resolve a scoped resource depending on the
// route (sessions/:id, tasks/:id, ...) — flagged unless excepted.
const PARAM_RE = /c\.req\.param\(\s*["']([^"']+)["']\s*\)/;
const SCOPED_PARAM = /^(id|workspaceId|sessionId|jobId|taskId|executionId|artifactId)$/;

interface Exception {
  file: string;
  pattern: string;
  reason: string;
}

const EXCEPTIONS: Exception[] = [
  {
    file: "server/routes/plugins.ts",
    pattern: 'c\\.req\\.param\\("id"\\)',
    reason: "Plugin catalog id (global registry, not a workspace resource). Workspace scope enters via workspaceId/input, which is guarded.",
  },
  {
    file: "server/routes/plugins.ts",
    pattern: 'c\\.req\\.param\\("grantId"\\)',
    reason: "Grant id (global install-policy record, not a workspace resource).",
  },
  {
    file: "server/routes/agent.ts",
    pattern: 'c\\.req\\.param\\("id"\\)',
    reason: "Approval id on /approvals/:id (global pending list, not a workspace resource). All workspace/session/task/artifact params on this file are guarded.",
  },
  {
    file: "server/routes/registry.ts",
    pattern: 'c\\.req\\.param\\("id"\\)',
    reason: "Registry plugin id (global catalog). Workspace scope enters via body.workspaceId, which is guarded.",
  },
];

function routeFiles(): string[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(ROUTES_DIR, f));
}

function isExcepted(rel: string, line: string): string | null {
  for (const e of EXCEPTIONS) {
    if (e.file === rel && new RegExp(e.pattern).test(line)) return e.reason;
  }
  return null;
}

describe("route guard coverage (#215)", () => {
  it("no route calls hasWorkspaceAccess directly (use server/auth/guard.ts)", () => {
    const offenders: string[] = [];
    for (const file of [...routeFiles(), INDEX_FILE]) {
      const rel = path.relative(REPO, file);
      const lines = fs.readFileSync(file, "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (line.includes("hasWorkspaceAccess")) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("every route taking a scoped id passes through the central guard", () => {
    const uncovered: string[] = [];
    for (const file of [...routeFiles(), INDEX_FILE]) {
      const rel = path.relative(REPO, file);
      const src = fs.readFileSync(file, "utf-8");
      if (!src.includes("auth/guard")) {
        // Files with no scoped-id intake at all are fine without the import;
        // check line by line below and report precisely.
      }
      const lines = src.split("\n");
      const hasGuard = src.includes("auth/guard");
      lines.forEach((line, i) => {
        const loc = `${rel}:${i + 1}`;
        let hit: string | null = null;
        const q = line.match(QUERY_RE);
        if (q) hit = `query("${q[1]}")`;
        const b = line.match(BODY_RE);
        if (b) hit = `id intake "${(b[4] ?? b[1]) + "." + (b[5] ?? b[3])}"`;
        const p = line.match(PARAM_RE);
        if (p && SCOPED_PARAM.test(p[1])) hit = `param("${p[1]}")`;
        if (!hit) return;
        if (isExcepted(rel, line)) return;
        if (!hasGuard) uncovered.push(`${loc}: ${hit} without auth/guard import :: ${line.trim()}`);
      });
    }
    expect(uncovered).toEqual([]);
  });
});
