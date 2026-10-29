import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getWorldLinks, addWorldLink } from "../server/workspace/worldLinks";

let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "polymax-world-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("World links store", () => {
  it("starts empty and round-trips a valid link", async () => {
    expect(await getWorldLinks(root)).toEqual([]);
  });

  it("adds a link and persists it across reads", async () => {
    const res = await addWorldLink({ from: "neural-networks", to: "statistics", reason: "optimization" }, root);
    expect(res.success).toBe(true);
    expect(res.link?.from).toBe("neural-networks");
    expect(res.link?.to).toBe("statistics");

    const links = await getWorldLinks(root);
    expect(links.length).toBe(1);
    expect(links[0].reason).toBe("optimization");
  });

  it("rejects self-links, empty ids, and duplicates", async () => {
    expect((await addWorldLink({ from: "a", to: "a" }, root)).success).toBe(false);
    expect((await addWorldLink({ from: "", to: "b" }, root)).success).toBe(false);
    expect((await addWorldLink({ from: "a", to: "b" }, root)).success).toBe(true);
    const dup = await addWorldLink({ from: "b", to: "a" }, root);
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("already linked");
  });

  it("tolerates a corrupt links file", async () => {
    await fs.writeFile(path.join(root, "world-links.json"), "not json{{{", "utf-8");
    expect(await getWorldLinks(root)).toEqual([]);
  });
});
