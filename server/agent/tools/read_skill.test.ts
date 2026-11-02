import { describe, expect, it } from "bun:test";
import { read_skill, readSkillContent, READABLE_SKILLS } from "./read_skill";

/** On-demand skill loading (#209): long material loads when needed. */
describe("read_skill tool", () => {
  it("lists available skills with sizes when name is omitted", async () => {
    const out = (await readSkillContent(undefined)) as any;
    expect(Array.isArray(out.skills)).toBe(true);
    const names = out.skills.map((s: any) => s.name).sort();
    expect(names).toEqual([...READABLE_SKILLS].sort());
    for (const s of out.skills) expect(s.tokens).toBeGreaterThan(0);
  });

  it("loads one skill stripped of metadata", async () => {
    const out = (await readSkillContent("app-overview")) as any;
    expect(out.name).toBe("app-overview");
    expect(out.content).toContain("dock");
    expect(out.content).not.toContain("maintainer refs");
  });

  it("refuses unknown skills with the allowlist", async () => {
    const out = (await readSkillContent("no-such-skill")) as any;
    expect(out.error).toContain("Unknown skill");
  });

  it("is registered with a no-name listing schema", () => {
    expect(read_skill.name).toBe("read_skill");
    const parsed = (read_skill.schema as any).safeParse({});
    expect(parsed.success).toBe(true);
  });
});
