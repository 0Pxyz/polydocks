import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../src/features/agent/AgentConversation.tsx"),
  "utf8"
);
const switcher = readFileSync(
  resolve(__dirname, "../src/features/agent/ModelSwitcher.tsx"),
  "utf8"
);

function sheetBlock(): string {
  const start = source.indexOf("1. SHEET MODE");
  const end = source.indexOf("2. FULL-SCREEN");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("chat capsule sheet (voice-first, footer picker)", () => {
  const sheet = sheetBlock();

  test("capsule header shows agent status with thinking indicator", () => {
    expect(sheet).toContain("Polymax Agent");
    expect(sheet).toContain("Thinking…");
  });

  test("footer composer mounts the model picker", () => {
    expect(sheet).toContain("<ModelSwitcher");
  });

  test("model picker offers end-to-end reasoning effort", () => {
    expect(switcher).toContain("Reasoning effort");
    expect(switcher).toContain("reasoning_effort");
    // The old local-only footnote must stay gone: effort reaches the backend.
    expect(switcher).not.toContain("Backend still receives modelId only");
  });

  test("sheet shows compact Orb + summary instead of a transcript", () => {
    expect(sheet).toContain("shortSummary");
    expect(sheet).toContain("tap to expand");
    // Restore copy lives in the shared shortSummary helper (used by the sheet).
    expect(source).toContain("Restoring your conversation");
    expect(sheet).not.toContain("ScrollArea");
    expect(sheet).not.toContain("sheetTranscriptRef");
    expect(sheet).not.toContain("overflow-y-auto");
  });

  test("single orb toggles realtime voice", () => {
    expect(sheet).toContain("toggleVoice");
    // Session management lives at component scope; the sheet wires the toggle.
    expect(source).toContain("connectRealtimeVoice");
    expect(source).toContain("stopMic");
  });

  test("attachments staging, paste and file input stay in the sheet", () => {
    expect(sheet).toContain("AttachmentStagingBar");
    expect(sheet).toContain("handlePaste");
    expect(source).toContain('type="file"');
    expect(sheet).toContain("stagedAttachments.length === 0");
  });

  test("approval banner and clear-conversation control exist", () => {
    expect(sheet).toContain("activeApproval");
    expect(sheet).toContain("clearConversation");
  });
});

describe("chat full/side views", () => {
  const fullSide = source.slice(source.indexOf("2. FULL-SCREEN"));

  test("transcript, typography and attachments use the native viewport", () => {
    expect(fullSide).toContain("overflow-y-auto");
    expect(fullSide).toContain("MessageAttachments");
    expect(fullSide).toContain("AttachmentStagingBar");
    expect(fullSide).toContain("ReactMarkdown");
    expect(fullSide).not.toContain("ScrollArea");
  });
});
