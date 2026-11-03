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

  test("capsule header shows agent status with a live dot, no Thinking label", () => {
    expect(sheet).not.toContain("Polymax Agent");
    expect(sheet).not.toContain("Thinking");
    // A live dot communicates work while streaming; words are redundant.
    expect(sheet).toContain("animate-ping");
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
    // Shared markdown + progressive reveal live in StreamingText (one
    // renderer for finished and streaming replies, no duplication).
    expect(fullSide).toContain("AssistantMarkdown");
    expect(fullSide).toContain("StreamingText");
    expect(fullSide).not.toContain("ScrollArea");
  });

  test("streaming has no Thinking fallback text", () => {
    // The durable thinking timeline (StepsTimeline + messageThinking state,
    // #296) is the timeline UI — not a bare "Thinking" fallback label.
    // Forbid user-visible fallback text while allowing the state/prop names.
    expect(fullSide).not.toContain(">Thinking<");
    expect(fullSide).not.toContain("Thinking…");
    expect(fullSide).not.toContain('"Thinking"');
  });

  test("resize edge is clamped, touch-friendly and keeps text selectable", () => {
    expect(source).toContain("startResize");
    expect(source).toContain("Math.max(MIN_W");
    expect(fullSide).toContain("touch-none");
    expect(fullSide).toContain("select-text");
  });

  test("composer sends on Enter, ignores IME composition", () => {
    expect(source).toContain("isComposing");
    expect(fullSide).toContain('placeholder="Ask anything"');
  });
});
