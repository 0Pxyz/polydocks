import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultTools } from "../server/agent/tools/index";
import { skillTokens, stripSkillMetadata, selectDomainSkills } from "../server/agent/skills/index";

const SKILLS_DIR = path.resolve("server/agent/skills");
const GUEST_BRIDGE = path.resolve("src/features/dock/bridge/guest-bridge.js");

async function skillFiles(): Promise<string[]> {
  const entries = await fs.readdir(SKILLS_DIR);
  return entries.filter((e) => e.endsWith(".md")).map((e) => path.join(SKILLS_DIR, e));
}

async function strippedSkills(): Promise<Array<{ file: string; text: string }>> {
  const out: Array<{ file: string; text: string }> = [];
  for (const file of await skillFiles()) {
    const raw = await fs.readFile(file, "utf-8");
    out.push({ file: path.basename(file), text: stripSkillMetadata(raw) });
  }
  return out;
}

function snakeTokens(text: string): string[] {
  return text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
}

async function schemaNames(): Promise<{ tables: Set<string>; columns: Set<string> }> {
  const sql = await fs.readFile(path.resolve("server/workspace/schema.sql"), "utf-8");
  const tables = new Set<string>();
  const columns = new Set<string>();
  let current: string | null = null;
  for (const line of sql.split("\n")) {
    const created = line.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    if (created) {
      current = created[1];
      tables.add(current);
      continue;
    }
    if (current && /^\s{2}\w+/.test(line)) {
      const col = line.trim().split(/\s+/)[0].replace(/[,();]/g, "");
      if (col && !["PRIMARY", "FOREIGN", "UNIQUE", "CONSTRAINT", "CHECK", "KEY"].includes(col)) {
        columns.add(col);
      }
    }
    if (current && line.trim() === ");") current = null;
  }
  return { tables, columns };
}

/** String literals the backend actually uses: "..." in server + guest bridge. */
async function backendLiterals(): Promise<Set<string>> {
  const lits = new Set<string>();
  const visit = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") await visit(full);
      } else if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const src = await fs.readFile(full, "utf-8");
        for (const m of src.matchAll(/["'`]([A-Za-z][\w./-]*\.[A-Za-z][\w./-]*)["'`]/g)) lits.add(m[1]);
      }
    }
  };
  await visit(path.resolve("server"));
  const bridge = await fs.readFile(GUEST_BRIDGE, "utf-8");
  for (const m of bridge.matchAll(/["'`]([A-Za-z][\w./-]*\.[A-Za-z][\w./-]*)["'`]/g)) lits.add(m[1]);
  lits.add("window.polymax");
  lits.add("window.polydocks");
  return lits;
}

describe("Skill drift guard: budgets", () => {
  it("app-overview stays under ~700 tokens, domain skills under ~600", async () => {
    for (const file of await skillFiles()) {
      const raw = await fs.readFile(file, "utf-8");
      const budget = path.basename(file) === "app-overview.md" ? 700 : 600;
      expect(skillTokens(raw), `${file} exceeds ${budget} tokens`).toBeLessThanOrEqual(budget);
    }
  });

  it("every skill carries maintainer file refs in a stripped comment", async () => {
    for (const file of await skillFiles()) {
      const raw = await fs.readFile(file, "utf-8");
      expect(raw, `${file} needs a maintainer <!-- --> comment`).toContain("<!--");
      expect(raw, `${file} comment should list source files`).toMatch(/server\/[\w/.]+/);
    }
  });

  it("every source file listed in skill comments exists", async () => {
    for (const file of await skillFiles()) {
      const raw = await fs.readFile(file, "utf-8");
      const comment = raw.match(/<!--[\s\S]*?-->/)?.[0] ?? "";
      const refs = comment.match(/(?:server|src)\/[A-Za-z0-9_./-]+\.(?:ts|js|tsx|md|css)/g) ?? [];
      expect(refs.length, `${file} comment lists no source files`).toBeGreaterThan(0);
      for (const ref of refs) {
        let exists = false;
        try {
          await fs.stat(path.resolve(ref));
          exists = true;
        } catch {
          exists = false;
        }
        expect(exists, `${file} references missing ${ref}`).toBe(true);
      }
    }
  });
});

describe("Skill drift guard: tools, tables, identifiers", () => {
  it("every snake_case name in a skill is a tool, arg, table, column, or tool result", async () => {
    const toolNames = new Set(defaultTools.map((t) => t.name));
    const { tables, columns } = await schemaNames();
    // Zod schema keys (tool argument names like domain_type) from tools/.
    const argNames = new Set<string>();
    const toolFiles = await fs.readdir(path.resolve("server/agent/tools"));
    for (const f of toolFiles) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = await fs.readFile(path.resolve("server/agent/tools", f), "utf-8");
      for (const m of src.matchAll(/^\s{4,8}(\w+):/gm)) argNames.add(m[1]);
      // Enum option values (domain_type choices, memory categories, risk levels).
      for (const m of src.matchAll(/"([a-z][a-z0-9_]*)"/g)) {
        if (m[1].includes("_")) argNames.add(m[1]);
      }
    }
    // Tool result strings returned by the backend, not tools or schema.
    const extras = new Set(["approval_required"]);
    for (const { file, text } of await strippedSkills()) {
      for (const token of new Set(snakeTokens(text))) {
        const known =
          toolNames.has(token) || argNames.has(token) || tables.has(token) || columns.has(token) || extras.has(token);
        expect(known, `${file} mentions unknown snake_case "${token}"`).toBe(true);
      }
    }
  });

  it("every dotted identifier in a skill exists as a backend literal", async () => {
    const lits = await backendLiterals();
    for (const { file, text } of await strippedSkills()) {
      const dots = text.match(/\b(?:tab|tray|map|plugin|theme|agent|dock|experience|storage|ui|open|browser|play)\.[A-Za-z][\w.]*/g) ?? [];
      for (const token of new Set(dots)) {
        const stem = token.replace(/\[[^\]]*\]/g, "");
        expect(lits.has(stem) || lits.has(token), `${file} mentions unknown identifier "${token}"`).toBe(true);
      }
    }
  });

  // NOTE (integration): the pre-integration version of this test asserted the
  // bridge has NO openContent/useCapability and no CSP anywhere. That pinned a
  // stale backend: the shipped guest bridge exposes both helpers and both
  // srcdoc builders emit a real CSP meta tag, and the skills must describe
  // that reality (Reader/openContent, useCapability, shadcn allowlist, CSP).
  it("bridge, srcdoc and skills agree on helpers and CSP", async () => {
    const bridge = await fs.readFile(GUEST_BRIDGE, "utf-8");
    expect(bridge).toContain("openContent");
    expect(bridge).toContain("useCapability");
    const features = await fs.readFile(path.resolve("server/workspace/features.ts"), "utf-8");
    expect(features).toContain("Content-Security-Policy");
    const byName = new Map<string, string>();
    for (const { file, text } of await strippedSkills()) byName.set(file, text);
    // The plugin/tab skills are the ones that must document the helpers.
    for (const name of ["plugins.md", "dock-and-tabs.md"]) {
      const text = byName.get(name) ?? "";
      expect(text, `${name} skill must document openContent`).toContain("openContent");
      expect(text, `${name} skill must document useCapability`).toContain("useCapability");
    }
    for (const { file, text } of await strippedSkills()) {
      for (const m of text.matchAll(/\bpolydocks\.([a-zA-Z_]+)/g)) {
        expect(bridge.includes(`${m[1]}:`) || bridge.includes(`${m[1]} =`), `${file} uses unknown bridge method polydocks.${m[1]}`).toBe(true);
      }
      for (const m of text.matchAll(/\bstorage\.(get|set|remove)\b|\bui\.(expand|collapse)\b/g)) {
        expect(bridge.includes(`${m[0].split(".")[1]}:`), `${file} uses unknown bridge ${m[0]}`).toBe(true);
      }
    }
  });
});

describe("Skill drift guard: routes and SSE events", () => {
  it("every /api path in a skill exists in the code", async () => {
    const routes = new Set<string>();
    const visit = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          const src = await fs.readFile(full, "utf-8");
          for (const m of src.matchAll(/\/api\/[A-Za-z/_:-]+/g)) routes.add(m[0].replace(/\/:[^/]*/g, "/:id"));
        }
      }
    };
    await visit(path.resolve("server/routes"));
    const indexSrc = await fs.readFile(path.resolve("server/index.ts"), "utf-8");
    for (const m of indexSrc.matchAll(/\/api\/[A-Za-z/_:-]+/g)) routes.add(m[0].replace(/\/:[^/]*/g, "/:id"));
    const mounts = [...indexSrc.matchAll(/app\.route\("(\/api\/[a-z]+)"/g)].map((m) => m[1]);
    for (const { file, text } of await strippedSkills()) {
      for (const m of text.matchAll(/\/api\/[A-Za-z/_:-]+/g)) {
        const mentioned = m[0];
        const covered = [...routes].some((r) => mentioned.startsWith(r) || r.startsWith(mentioned)) ||
          mounts.some((base) => mentioned.startsWith(base));
        expect(covered, `${file} mentions unknown route ${mentioned}`).toBe(true);
      }
    }
  });

  it("skill-mentioned SSE events exist in AgentStepEvent and are emitted", async () => {
    const loop = await fs.readFile(path.resolve("server/agent/loop.ts"), "utf-8");
    const eventBlock = loop.match(/export interface AgentStepEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    const declared = new Set([...eventBlock.matchAll(/"([a-z.]+)"/g)].map((m) => m[1]));
    const afterInterface = loop.slice(loop.indexOf(eventBlock) + eventBlock.length);
    // Event names reach emit() as plain literals or ternaries (plugin.created).
    const emitted = new Set([...afterInterface.matchAll(/"([a-z][a-z.]+)"/g)].map((m) => m[1]));
    const sseNames = ["agent.start", "agent.finish", "tool.start", "tool.done", "tab.created", "tray.open", "tab.prime", "map.changed", "map.point.added", "plugin.created", "plugin.updated", "plugin.published", "plugin.operated"];
    for (const { file, text } of await strippedSkills()) {
      for (const name of sseNames) {
        if (text.includes(name)) {
          expect(declared.has(name), `${file} mentions undeclared event ${name}`).toBe(true);
          expect(emitted.has(name), `${file} mentions never-emitted event ${name}`).toBe(true);
        }
      }
      expect(text, `${file} must not promise theme.apply (no such emit on this backend)`).not.toContain("theme.apply");
    }
  });
});

describe("Skill drift guard: intent to skills mapping (PT+EN)", () => {
  const cases: Array<{ prompt: string; expected: string[] }> = [
    { prompt: "fix the reader", expected: ["plugins"] },
    { prompt: "arruma o reader", expected: ["plugins"] },
    { prompt: "open in reader doesn't work", expected: ["plugins"] },
    { prompt: "find articles about go to market", expected: ["content-and-reader"] },
    { prompt: "pesquise artigos sobre go to market", expected: ["content-and-reader"] },
    { prompt: "cria uma cidade sobre estoicismo", expected: ["world-and-cities"] },
    { prompt: "crie uma cidade sobre física quântica", expected: ["world-and-cities"] },
    { prompt: "close the flashcards tab", expected: ["dock-and-tabs"] },
    { prompt: "fechar a aba de flashcards", expected: ["dock-and-tabs"] },
    { prompt: "what tabs do I have", expected: ["dock-and-tabs"] },
    { prompt: "quais abas eu tenho", expected: ["dock-and-tabs"] },
    // Theme backend exists (apply_theme tool + theme.md skill): theme asks
    // select the theme skill so the protocol is injected on demand.
    { prompt: "add this background to my theme", expected: ["theme"] },
  ];

  for (const { prompt, expected } of cases) {
    it(`"${prompt}" -> [${expected.join(", ")}]`, () => {
      expect(selectDomainSkills(prompt)).toEqual(expected);
    });
  }
});
