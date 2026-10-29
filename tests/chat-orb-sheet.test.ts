import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../src/features/agent/AgentConversation.tsx"),
  "utf8"
);

function sheetBlock(): string {
  const start = source.indexOf("1. SHEET MODE");
  const end = source.indexOf("2. FULL-SCREEN");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("chat orb-first sheet capsule", () => {
  const sheet = sheetBlock();

  test("shows the reply as clamped preview text, not a scrollable transcript", () => {
    expect(sheet).toContain("line-clamp-3");
    expect(sheet).not.toContain("ScrollArea");
    expect(sheet).not.toContain("sheetTranscriptRef");
    expect(sheet).not.toContain("space-y-6");
  });

  test("keeps the orb as the primary capsule control", () => {
    expect(sheet).toContain("<Orb");
    expect(sheet).toContain('size="md"');
    expect(sheet).toContain("Close to dock");
    expect(sheet).toContain("Expand to full chat");
  });

  test("typing is an explicit mode toggled from the capsule footer", () => {
    expect(sheet).toContain("isKeyboardInSheet");
    expect(sheet).toContain("Type prompt");
    expect(sheet).toContain("Switch to Orb");
  });

  test("model switcher stays reachable from the sheet", () => {
    expect(sheet).toContain("<ModelSwitcher compact");
  });

  test("attachments work from the sheet without the full transcript", () => {
    expect(sheet).toContain("AttachmentStagingBar");
    expect(sheet).toContain("handleSheetDrop");
    expect(sheet).toContain("handlePaste");
    expect(sheet).toContain('type="file"');
    // Send is enabled when attachments are staged even with an empty draft.
    expect(sheet).toContain("!draft.trim() && !hasStaged");
  });
});

describe("chat full/side views", () => {
  const fullSide = source.slice(source.indexOf("2. FULL-SCREEN"));

  test("transcript, typography and attachments are untouched", () => {
    expect(fullSide).toContain("ScrollArea");
    expect(fullSide).toContain("MessageAttachments");
    expect(fullSide).toContain("AttachmentStagingBar");
    expect(fullSide).toContain("ReactMarkdown");
  });
});
