import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { config } from "../server/config";
import { internalError, isDev, safeMessage } from "../server/errors";

/**
 * Public/internal error boundary (#322): unexpected failures log full
 * detail server-side but expose nothing mechanical to clients unless
 * the server explicitly runs in development (fail-closed).
 */
describe("public error boundary (#322)", () => {
  it("is fail-closed outside development", () => {
    expect(isDev()).toBe(false);
    const out = internalError("probe", new Error("sqlite boomssl key=shh"), "Failed to probe");
    expect(out.status).toBe(500);
    expect(out.body).toEqual({ error: "Failed to probe" });
    expect(JSON.stringify(out.body)).not.toContain("boom");
    expect(safeMessage(new Error("upstream 401 token=x"), "Upstream failed")).toBe("Upstream failed");
  });

  it("exposes detail in development only", () => {
    const prev = config.NODE_ENV;
    (config as any).NODE_ENV = "development";
    try {
      expect(isDev()).toBe(true);
      const out = internalError("probe", new Error("sqlite boom"), "Failed to probe");
      expect(out.body).toEqual({ error: "sqlite boom", detail: "Failed to probe" });
      expect(safeMessage(new Error("upstream 401"), "Upstream failed")).toBe("upstream 401");
    } finally {
      (config as any).NODE_ENV = prev;
    }
  });

  it("route 500s never forward raw err.message (memory, registry, workspaces)", () => {
    const offenders: string[] = [];
    for (const file of ["server/routes/memory.ts", "server/routes/registry.ts", "server/routes/workspaces.ts"] as const) {
      const lines = fs.readFileSync(path.resolve(import.meta.dir, "..", file), "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (/c\.json\(/.test(line) && /err(\.message| instanceof)/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
