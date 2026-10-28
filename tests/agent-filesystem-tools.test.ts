import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveSafeAgentPath,
  listFiles,
  readFileSafe,
  writeFileSafe,
  editFileSafe,
  searchFiles,
} from "../server/system/filesystem";
import { initAgentHome } from "../server/system/agentHome";
import { list_files } from "../server/agent/tools/list_files";
import { read_file } from "../server/agent/tools/read_file";
import { write_file } from "../server/agent/tools/write_file";
import { edit_file } from "../server/agent/tools/edit_file";
import { search_files } from "../server/agent/tools/search_files";

describe("Agent Filesystem Service & Tool Suite (Issue #74)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-agent-filesystem-fixture");
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
    await initAgentHome(TEST_ROOT);
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  describe("Security Guards: Path Traversal & Symlink Escape", () => {
    it("strictly blocks path traversal attempts using ../", async () => {
      expect(resolveSafeAgentPath("../outside.txt", TEST_ROOT)).rejects.toThrow(
        "Path traversal violation"
      );
      expect(resolveSafeAgentPath("../../etc/passwd", TEST_ROOT)).rejects.toThrow(
        "Path traversal violation"
      );
      expect(resolveSafeAgentPath("artifacts/../../escaped.txt", TEST_ROOT)).rejects.toThrow(
        "Path traversal violation"
      );
    });

    it("strictly blocks paths with null bytes", async () => {
      expect(resolveSafeAgentPath("artifacts/\0hacked.txt", TEST_ROOT)).rejects.toThrow(
        "Invalid path"
      );
    });

    it("strictly blocks symlinks escaping agent-home root", async () => {
      // Create external folder outside TEST_ROOT
      const externalDir = path.resolve(process.cwd(), "test-external-target");
      await fs.mkdir(externalDir, { recursive: true });
      await fs.writeFile(path.join(externalDir, "secret.txt"), "forbidden content");

      // Symlink pointing to external folder inside TEST_ROOT
      const symlinkPath = path.join(TEST_ROOT, "artifacts", "escape_link");
      await fs.symlink(externalDir, symlinkPath, "dir");

      try {
        expect(resolveSafeAgentPath("artifacts/escape_link/secret.txt", TEST_ROOT)).rejects.toThrow(
          "Symlink escape violation"
        );
      } finally {
        await fs.rm(externalDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe("File Operations: Read, Write, Edit, Search", () => {
    it("lists files and subdirectories with listFiles and list_files tool", async () => {
      // Create a test file
      await writeFileSafe("artifacts/deliverable.txt", "Sample output", { rootDir: TEST_ROOT });

      const files = await listFiles(".", { recursive: true, rootDir: TEST_ROOT });
      expect(files.some((f) => f.name === "AGENTS.md")).toBe(true);
      expect(files.some((f) => f.path.includes("artifacts/deliverable.txt"))).toBe(true);

      // Verify tool execution
      const toolRes = (await list_files.execute({ path: "artifacts" }, { cityId: "test", step: 1 })) as any;
      expect(toolRes.totalEntries).toBeGreaterThanOrEqual(1);
      expect(toolRes.entries.some((e: any) => e.name === "deliverable.txt")).toBe(true);
    });

    it("reads file content safely with pagination and byte limit caps", async () => {
      const multiline = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n";
      await writeFileSafe("memory/log.txt", multiline, { rootDir: TEST_ROOT });

      // Read with offset and limit
      const readRes = await readFileSafe("memory/log.txt", {
        offset: 1,
        limit: 2,
        rootDir: TEST_ROOT,
      });

      expect(readRes.content).toBe("Line 2\nLine 3");
      expect(readRes.totalLines).toBe(6);
      expect(readRes.truncated).toBe(true);

      // Read with byte cap
      const largeContent = "A".repeat(200);
      await writeFileSafe("artifacts/large.txt", largeContent, { rootDir: TEST_ROOT });
      const capped = await readFileSafe("artifacts/large.txt", { maxBytes: 50, rootDir: TEST_ROOT });
      expect(capped.truncated).toBe(true);
      expect(capped.content).toContain("[truncated: file exceeded byte cap]");

      // Test read_file tool
      const toolRes = (await read_file.execute({ path: "memory/log.txt", offset: 0, limit: 1 }, { cityId: "test", step: 1 })) as any;
      expect(toolRes.content).toBe("Line 1");
    });

    it("writes files atomically and creates parent directories automatically", async () => {
      const targetPath = "workspaces/project-alpha/specs/architecture.md";
      const writeRes = await writeFileSafe(targetPath, "# Architecture Specification\nDetails here.", {
        rootDir: TEST_ROOT,
      });

      expect(writeRes.path).toBe(targetPath);
      expect(writeRes.bytesWritten).toBeGreaterThan(20);

      // Verify file exists on disk
      const readBack = await readFileSafe(targetPath, { rootDir: TEST_ROOT });
      expect(readBack.content).toContain("# Architecture Specification");

      // Verify overwrite guard
      expect(
        writeFileSafe(targetPath, "New content", { overwrite: false, rootDir: TEST_ROOT })
      ).rejects.toThrow("File already exists");

      // Verify write_file tool
      const toolRes = (await write_file.execute(
        { path: "artifacts/test_tool.md", content: "Tool content", overwrite: true },
        { cityId: "test", step: 1 }
      )) as any;
      expect(toolRes.path).toBe("artifacts/test_tool.md");
    });

    it("edits files with exact targeted replacement and rejects ambiguous matches", async () => {
      const initialText = "Item: Apple\nStatus: Pending\nItem: Banana\n";
      await writeFileSafe("tasks/todo.txt", initialText, { rootDir: TEST_ROOT });

      // Successful targeted replacement
      const editRes = await editFileSafe("tasks/todo.txt", "Status: Pending", "Status: Completed", {
        rootDir: TEST_ROOT,
      });
      expect(editRes.replacements).toBe(1);

      const afterEdit = await readFileSafe("tasks/todo.txt", { rootDir: TEST_ROOT });
      expect(afterEdit.content).toContain("Status: Completed");

      // Ambiguous match (Item: appears twice)
      expect(
        editFileSafe("tasks/todo.txt", "Item: ", "Product: ", { rootDir: TEST_ROOT })
      ).rejects.toThrow("appears 2 times");

      // Target not found
      expect(
        editFileSafe("tasks/todo.txt", "Status: Missing", "Status: New", { rootDir: TEST_ROOT })
      ).rejects.toThrow("Target text was not found");

      // Verify edit_file tool
      const toolRes = (await edit_file.execute(
        { path: "tasks/todo.txt", target: "Status: Completed", replacement: "Status: Verified" },
        { cityId: "test", step: 1 }
      )) as any;
      expect(toolRes.replacements).toBe(1);
    });

    it("searches text files across agent-home using searchFiles and search_files tool", async () => {
      await writeFileSafe("memory/2026-10-28.md", "Learned about quantum superposition today.", {
        rootDir: TEST_ROOT,
      });
      await writeFileSafe("artifacts/quantum.md", "Quantum entanglement is non-local.", {
        rootDir: TEST_ROOT,
      });
      await writeFileSafe("tasks/todo.txt", "Fix quantum bug in circuit generator.", {
        rootDir: TEST_ROOT,
      });

      const searchRes = await searchFiles("quantum", { rootDir: TEST_ROOT });
      expect(searchRes.totalMatches).toBeGreaterThanOrEqual(3);
      expect(searchRes.matches.some((m) => m.text.includes("superposition"))).toBe(true);

      // Search with extension filter
      const mdSearch = await searchFiles("quantum", { extension: ".md", rootDir: TEST_ROOT });
      expect(mdSearch.matches.every((m) => m.file.endsWith(".md"))).toBe(true);

      // Verify search_files tool
      const toolRes = (await search_files.execute(
        { query: "entanglement", extension: ".md" },
        { cityId: "test", step: 1 }
      )) as any;
      expect(toolRes.totalMatches).toBe(1);
      expect(toolRes.matches[0].text).toContain("entanglement");
    });
  });
});
