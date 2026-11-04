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
    expect(sheet).not.toContain("Polydocks Agent");
    expect(sheet).not.toContain("Thinking");
    // A live dot communicates work while streaming; words are redundant.
    expect(sheet).toContain("animate-ping");
  });

  test("footer composer hides the model picker (logic kept)", () => {
    // UI removal is temporary: the picker component, models store and
    // backend routing stay intact (see ModelSwitcher.tsx).
    expect(sheet).not.toContain("<ModelSwitcher");
    expect(sheet).toContain("Model selector removed from the UI temporarily");
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
    // No transcript scroller in the sheet; the composer textarea may still
    // scroll vertically once it hits its own max height.
    expect(sheet).not.toContain("transcriptRef");
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

  test("sheet composer is a growing textarea, not a fixed single-line input", () => {
    expect(sheet).not.toContain('type="text"');
    expect(sheet).toContain("<textarea");
    expect(sheet).toContain("rows={1}");
    expect(sheet).toContain("adjustSheetHeight");
    // Height tracks scrollHeight at component scope (shared by the effect,
    // onChange and onInput), resetting to one line when the draft clears.
    expect(source).toContain("el.style.height = `${el.scrollHeight}px`");
    // Capped growth in viewport units (mobile + keyboard safe), vertical
    // scroll past the cap, no horizontal scroll, soft wrapping.
    expect(sheet).toContain("max-h-[40dvh]");
    expect(sheet).toContain("overflow-y-auto");
    expect(sheet).toContain("overflow-x-hidden");
    expect(sheet).toContain("whitespace-pre-wrap");
    expect(sheet).toContain("[overflow-wrap:anywhere]");
    expect(sheet).toContain("resize-none");
    // Composer buttons stay pinned to the bottom row as the field grows.
    expect(sheet).toContain("items-end");
    // 16px minimum on mobile (no iOS auto-zoom), compact on desktop.
    expect(sheet).toContain("text-base sm:text-xs");
  });

  test("sheet send stays available while streaming (turns queue FIFO)", () => {
    // Stop and send coexist: the submit button is never swapped out for
    // the stop button, and submit always queues instead of aborting.
    expect(sheet).toContain("Queue message behind the running turn");
    expect(sheet).not.toContain("isStreaming ? (");
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
