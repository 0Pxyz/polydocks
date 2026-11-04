import { useDockStore } from "@/lib/store/useDockStore";
import { useThemeStore } from "@/lib/theme";
import { useWorkspaceStore } from "@/lib/store/useWorkspaceStore";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { useOnboardingStore } from "@/lib/store/useOnboardingStore";
import { pushThought } from "@/lib/agent/thoughtStream";
import { DEMO_FIXTURES } from "./demoFixtures";
import { ONBOARDING_STEP_PROMPTS } from "@/lib/store/useOnboardingStore";
import { youtubeEmbedUrl } from "./demoFixtures";
import type { OnboardingStep } from "@/lib/store/useOnboardingStore";

/**
 * Token-free demo play: the tour performs the same real operations the
 * agent would (same theme store, same dock, same capability bus over
 * HTTP) but with zero model calls. Nothing is invented: research hits the
 * real TinyFish integration, theme changes go through the live theme
 * store, navigation opens the real surfaces. The model is never invoked,
 * so a full replay costs no tokens.
 *
 * Trace-free by design: the workspace theme is snapshotted on play and
 * restored when the tour closes; feed/memory/note writes dedupe, so a
 * replay never stacks duplicates.
 */

let autoplay = false;
let themeSnapshot: Record<string, unknown> | null = null;
/** Demo-script cancellation (Play tour). Separate from liveCancelled:
 *  the engine stops the live tour when a demo run starts and vice versa —
 *  a shared flag made each starter cancel its own run on arrival. */
let demoCancelled = false;
/** Live-auto cancellation (Auto live tour). See demoCancelled. */
let liveCancelled = false;

export function isDemoAutoplay(): boolean {
  return autoplay;
}

export function startDemoAutoplay(): void {
  autoplay = true;
  demoCancelled = false;
}

export function stopDemoAutoplay(): void {
  autoplay = false;
  demoCancelled = true;
}

// --- Live auto tour: typed prompts + real sends, chained to the end ---

let liveAuto = false;
let liveStepInFlight: string | null = null;

/** Last script events (capped) for on-device debugging. */
export const demoTrace: Array<{ t: number; step: string; action: string; error?: string }> = [];
if (typeof window !== "undefined") {
  (window as any).__demoTrace = demoTrace;
}

function trace(step: string, action: string, error?: string): void {
  demoTrace.push({ t: Date.now(), step, action, error });
  if (demoTrace.length > 20) demoTrace.shift();
}

/** Demo script currently executing (re-entry guard: view kick and engine
 *  effect, plus StrictMode double-effects, must not run it twice). */
let demoStepInFlight: string | null = null;

export function isDemoStepInFlight(step: string): boolean {
  return demoStepInFlight === step;
}

/** True while any scripted or live-auto turn is in flight (view- or
 *  engine-started). The auto-advance timer must hold while busy. */
let busyCount = 0;

export function isDemoBusy(): boolean {
  return busyCount > 0;
}

function markBusy(on: boolean): void {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
}

export function isLiveAuto(): boolean {
  return liveAuto;
}

export function startLiveAuto(): void {
  liveAuto = true;
  liveCancelled = false;
}

export function stopLiveAuto(): void {
  liveAuto = false;
  liveStepInFlight = null;
  liveCancelled = true;
}

function convoState(): { draft: string; isStreaming: boolean } {
  try {
    const s = useConversationStore.getState();
    return { draft: s.draft, isStreaming: s.isStreaming };
  } catch {
    return { draft: "", isStreaming: false };
  }
}

function setDraftText(text: string): void {
  try {
    useConversationStore.getState().setDraft(text);
  } catch {
    // Store unavailable (tests) — typing is a no-op there.
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/**
 * Types the prompt into the bottom-chat composer like the user would —
 * same text, same field, then a real send. Aborts silently when the user
 * takes over the composer mid-typing.
 */
export async function typePromptText(
  prompt: string,
  opts?: { tickMs?: number; charsPerTick?: number }
): Promise<void> {
  const tickMs = opts?.tickMs ?? 30;
  const charsPerTick = opts?.charsPerTick ?? 6;
  if (reducedMotion()) {
    setDraftText(prompt);
    await sleep(300);
    return;
  }
  setDraftText("");
  for (let i = 0; i < prompt.length; i += charsPerTick) {
    if (liveCancelled || !isLiveAuto()) throw new Error("demo-cancelled");
    const next = prompt.slice(0, i + charsPerTick);
    // User took over the composer — stop, never fight their input.
    if (convoState().draft !== prompt.slice(0, i)) throw new Error("demo-cancelled");
    setDraftText(next);
    await sleep(tickMs);
  }
}

/** Fast local theme pass for the customize step (~2s, restored on cancel). */
async function previewThemes(): Promise<void> {
  let prev: { theme: unknown; dockStyle: unknown } | null = null;
  try {
    const t = useThemeStore.getState();
    prev = { theme: t.theme, dockStyle: t.dockStyle };
  } catch {
    return;
  }
  const stops = [
    { theme: "cyber", dockStyle: "lift" },
    { theme: "amber", dockStyle: "solid" },
    { theme: "amethyst", dockStyle: "bare" },
    { theme: "void", dockStyle: "glass" },
  ] as const;
  try {
    const t = useThemeStore.getState();
    for (const stop of stops) {
      if (liveCancelled || !isLiveAuto()) throw new Error("demo-cancelled");
      t.setTheme(stop.theme as any);
      t.setDockStyle(stop.dockStyle as any);
      await sleep(800);
    }
  } finally {
    if ((liveCancelled || !isLiveAuto()) && prev) {
      try {
        const t = useThemeStore.getState();
        t.setTheme(prev.theme as any);
        t.setDockStyle(prev.dockStyle as any);
      } catch {
        // Best effort.
      }
    }
  }
}

/** Server-generated failure templates (never model prose). */
const TURN_FAILURE_PREFIXES = [
  "Something went wrong.",
  "Couldn't reach the orchestrator",
  "Nothing called \"",
  "is not in your dock",
  "The model failed to generate a response",
  "400 ",
];

function turnFailed(content: string): boolean {
  const text = content.trim();
  if (!text) return true;
  return TURN_FAILURE_PREFIXES.some((p) => text.startsWith(p));
}

/**
 * One live auto step: type the prompt, send it for real, wait for the
 * turn to settle, then advance — stopping honestly on user takeover,
 * step change, timeout, or a failed turn (the error stays visible).
 */
export async function runLiveAutoStep(
  step: OnboardingStep,
  prompt: string,
  opts?: { onBusyChange?: (busy: boolean) => void; settleTimeoutMs?: number }
): Promise<"advanced" | "stopped"> {
  if (liveStepInFlight === step) return "stopped";
  liveStepInFlight = step;
  markBusy(true);
  opts?.onBusyChange?.(true);
  try {
    const store = useOnboardingStore.getState();
    const stepAtSend = store.currentStep;
    // Customize opens with a fast local feel-the-themes pass (same store
    // the agent drives); the single-batch turn then settles the default.
    if (step === "customize" && !reducedMotion()) {
      await previewThemes();
      if (liveCancelled || !isLiveAuto()) throw new Error("demo-cancelled");
    }
    await typePromptText(prompt);
    const before = (() => {
      try {
        return useConversationStore.getState().messages.length;
      } catch {
        return 0;
      }
    })();
    await useConversationStore.getState().sendMessage(undefined, undefined, { origin: "chat" });
    // Wait for the turn to start, then settle.
    const settleTimeoutMs = opts?.settleTimeoutMs ?? 8 * 60 * 1000;
    const start = Date.now();
    let started = false;
    for (;;) {
      if (liveCancelled || !isLiveAuto()) throw new Error("demo-cancelled");
      if (Date.now() - start > settleTimeoutMs) {
        pushThought("Demo auto tour: turn is taking too long — stopping here.");
        stopLiveAuto();
        return "stopped";
      }
      const s = convoState();
      if (s.isStreaming) started = true;
      else if (started) break;
      // Immediate local failure (no stream ever opens).
      else if (Date.now() - start > 15000) break;
      await sleep(2000);
    }
    // Let the result land on screen before moving on.
    await sleep(4000);
    if (liveCancelled || !isLiveAuto()) throw new Error("demo-cancelled");
    if (useOnboardingStore.getState().currentStep !== stepAtSend) return "stopped";
    // Honest stop: the failure text stays in the chat for the user to see.
    let failed = false;
    try {
      const msgs = useConversationStore.getState().messages;
      const fresh = msgs.slice(before).filter((m: any) => m.role === "assistant");
      const last = fresh[fresh.length - 1] as any;
      if (last && turnFailed(String(last.content ?? ""))) failed = true;
    } catch {
      failed = false;
    }
    if (failed) {
      pushThought("Demo auto tour: that turn failed — stopping for you to retry.");
      stopLiveAuto();
      return "stopped";
    }
    if (stepAtSend === "handoff" || !useOnboardingStore.getState().isOpen) return "stopped";
    useOnboardingStore.getState().nextStep();
    return "advanced";
  } finally {
    if (liveStepInFlight === step) liveStepInFlight = null;
    markBusy(false);
    opts?.onBusyChange?.(false);
  }
}

function workspaceId(): string {
  try {
    return useWorkspaceStore.getState().activeWorkspaceId || "default";
  } catch {
    return "default";
  }
}

/* ---------------- Typed demo actions (scripted tour, zero tokens) -------- */

export type DemoAction =
  | { kind: "say"; text: string }
  | { kind: "type"; text: string }
  | { kind: "open"; id: string }
  | { kind: "beside"; id: string }
  | { kind: "theme"; theme: string; dockStyle?: string }
  | { kind: "wallpaper"; url: string; opacity?: number }
  | { kind: "feedItems"; items: Array<{ kind: string; title: string; site: string; url: string; hook: string; fullText: string; image?: string | null; author?: string | null; durationSec?: number }> }
  | { kind: "reader"; item: { kind: string; title: string; site: string; url: string; body: string; durationSec?: number } }
  | { kind: "note"; title: string; body: string }
  | { kind: "memoryDemo"; text: string }
  | { kind: "dashboard" }
  | { kind: "wait"; ms: number }
  | { kind: "spot"; selector: string | null }
  | { kind: "closeBeside" };

function reducedMs(ms: number): number {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Math.min(ms, 150);
  } catch {
    return Math.min(ms, 150);
  }
  return ms;
}

async function gate(step: OnboardingStep): Promise<void> {
  for (;;) {
    if (demoCancelled || !isDemoAutoplay()) {
      trace(step, "gate-abort", `demoCancelled=${demoCancelled} autoplay=${isDemoAutoplay()}`);
      throw new Error("demo-cancelled");
    }
    if (useOnboardingStore.getState().currentStep !== step) {
      trace(step, "gate-abort", `stepmoved=${useOnboardingStore.getState().currentStep}`);
      throw new Error("demo-cancelled");
    }
    if (useOnboardingStore.getState().paused) {
      await sleep(200);
      continue;
    }
    return;
  }
}

async function runAction(step: OnboardingStep, action: DemoAction): Promise<void> {
  await gate(step);
  trace(step, action.kind === "open" || action.kind === "beside" ? `${action.kind}:${action.id}` : action.kind);
  switch (action.kind) {
    case "say":
      pushThought(action.text);
      return;
    case "type":
      await typeGhostText(action.text);
      await gate(step);
      await sleep(reducedMs(400));
      return;
    case "open":
      openTool(action.id);
      await sleep(reducedMs(900));
      return;
    case "beside":
      showBeside(action.id);
      spotTo(`[data-dock-tool-id="${action.id}"]`);
      await sleep(reducedMs(1200));
      return;
    case "theme": {
      try {
        const t = useThemeStore.getState();
        t.setTheme(action.theme as any);
        if (action.dockStyle) t.setDockStyle(action.dockStyle as any);
      } catch {
        pushThought("Theme store unavailable in this context");
      }
      await sleep(reducedMs(900));
      return;
    }
    case "wallpaper": {
      try {
        useThemeStore.getState().setWallpaper(action.url, { opacity: action.opacity ?? 0.25 });
      } catch {
        pushThought("Theme store unavailable in this context");
      }
      await sleep(reducedMs(900));
      return;
    }
    case "feedItems": {
      for (const item of action.items) {
        await gate(step);
        try {
          const res: any = await invokeCap("sources.import", { workspaceId: workspaceId(), ...item });
          const id = res?.data?.data?.id ?? res?.data?.id;
          if (typeof id === "string") trackSource(id);
        } catch {
          // One bad item never stops the feed.
        }
        await sleep(reducedMs(600));
      }
      return;
    }
    case "reader": {
      try {
        const { openReader } = useConversationStore.getState() as any;
        const isVideo = action.item.kind === "video";
        const embedUrl = isVideo ? youtubeEmbedUrl(action.item.url) : null;
        if (typeof openReader === "function") {
          openReader({
            mode: isVideo ? "video" : "reader",
            title: action.item.title,
            url: action.item.url,
            site: action.item.site,
            markdown: action.item.body,
            embedUrl: embedUrl ?? undefined,
          });
        }
      } catch {
        // Reader store unavailable — the browser still shows the feed.
      }
      await sleep(reducedMs(900));
      return;
    }
    case "note": {
      try {
        const listed: any = await invokeCap("notes.list", { workspaceId: workspaceId() });
        const items = listed?.data?.data?.items ?? listed?.data?.items ?? [];
        const existing = (Array.isArray(items) ? items : []).find((n: any) => n?.title === action.title);
        if (existing?.id) {
          trackNote(existing.id);
        } else {
          const created: any = await invokeCap("notes.add", {
            workspaceId: workspaceId(),
            title: action.title,
            body: action.body,
          });
          const id = created?.data?.data?.id ?? created?.data?.id;
          if (typeof id === "string") trackNote(id);
        }
      } catch {
        // Notes unavailable — the surface still opens honestly empty.
      }
      await sleep(reducedMs(600));
      return;
    }
    case "memoryDemo":
      // Demo-only animation: never written to the user's real memory.
      pushThought(`Demo memory saved (demo only): ${action.text}`);
      await sleep(reducedMs(1200));
      return;
    case "dashboard":
      showBeside("demo-dashboard");
      spotTo('[data-tour="dashboard"]');
      await sleep(reducedMs(1500));
      return;
    case "wait":
      await sleep(reducedMs(action.ms));
      return;
    case "spot":
      spotTo(action.selector);
      await sleep(reducedMs(500));
      return;
    case "closeBeside":
      clearDemoBeside();
      clearSpot();
      return;
  }
}

/** Ghost typing into the real composer: visible, never sent, no history. */
async function typeGhostText(text: string): Promise<void> {
  const getDraft = (): string | null => {
    try {
      return useConversationStore.getState().draft;
    } catch {
      return null;
    }
  };
  const setDraft = (value: string): void => {
    try {
      useConversationStore.getState().setDraft(value);
    } catch {
      // Store unavailable — typing still narrates via thoughts.
    }
  };
  let fast = false;
  try {
    fast = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    fast = true;
  }
  if (fast) {
    setDraft(text);
    await sleep(200);
    return;
  }
  setDraft("");
  for (let i = 0; i < text.length; i += 6) {
    if (demoCancelled || !isDemoAutoplay()) throw new Error("demo-cancelled");
    // Fresh read every tick: the store replaces its state object on each
    // set, so a cached snapshot would always look "taken over".
    const cur = getDraft();
    if (cur !== null && cur !== text.slice(0, i)) throw new Error("demo-cancelled");
    setDraft(text.slice(0, i + 6));
    await sleep(30);
  }
}

async function invokeCap(capabilityId: string, input: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/capabilities/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capabilityId, input, workspaceId: workspaceId() }),
  });
  return (await res.json().catch(() => null)) as any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pause(ms: number): Promise<void> {
  await sleep(ms);
  if (demoCancelled || !useOnboardingStore.getState().isOpen) throw new Error("demo-cancelled");
}

function openTool(id: string): void {
  try {
    useDockStore.getState().openTool(id);
  } catch {
    // Store unavailable (tests) — narration still carries the tour.
  }
}

const demoBesideIds: string[] = [];

/**
 * Demo surfaces open BESIDE the tour stage (never in place of it): the
 * onboarding design keeps the stage visible while settings, tools, feed
 * or notes appear next to it. Falls back to a main-view open where the
 * beside panel is unavailable.
 */
function showBeside(id: string): void {
  try {
    const dock = useDockStore.getState();
    if (typeof dock.openBeside === "function") {
      dock.openBeside(id);
      if (!demoBesideIds.includes(id)) demoBesideIds.push(id);
      return;
    }
  } catch {
    // Store unavailable (tests) — narration still carries the tour.
  }
  openTool(id);
}

/** Close only the beside tabs this demo opened. */
function clearDemoBeside(): void {
  try {
    const dock = useDockStore.getState();
    for (const id of demoBesideIds.splice(0)) {
      if (typeof dock.closeBeside === "function") dock.closeBeside(id);
    }
  } catch {
    demoBesideIds.length = 0;
  }
}


/* ---------------- Demo trace: created ids, snapshots, spotlight ------ */

const demoSourceIds: string[] = [];
const demoNoteIds: string[] = [];

function trackSource(id: string): void {
  if (!demoSourceIds.includes(id)) demoSourceIds.push(id);
}

function trackNote(id: string): void {
  if (!demoNoteIds.includes(id)) demoNoteIds.push(id);
}

/** Delete everything the tour created (sources + notes). Best effort. */
export async function deleteDemoData(): Promise<void> {
  const ws = workspaceId();
  for (const id of demoSourceIds.splice(0)) {
    try {
      await invokeCap("sources.remove", { id, workspaceId: ws });
    } catch {
      // Already gone or unreachable — trace still clears.
    }
  }
  for (const id of demoNoteIds.splice(0)) {
    try {
      await invokeCap("notes.remove", { id, workspaceId: ws });
    } catch {
      // Already gone or unreachable — trace still clears.
    }
  }
}

/** Adopt the demo state: keep everything, drop the restore markers. */
export function clearDemoMarks(): void {
  demoSourceIds.length = 0;
  demoNoteIds.length = 0;
  themeSnapshot = null;
  dockSnapshot = null;
}

interface VisualSnapshot {
  theme: unknown;
  customAccentColor: unknown;
  wallpaperUrl: unknown;
  wallpaperFit: unknown;
  wallpaperOpacity: unknown;
  wallpaperBlur: unknown;
  dockStyle: unknown;
  dockPosition: unknown;
  openIds: string[];
  focusedId: string | null;
  besideIds: string[];
}

let dockSnapshot: VisualSnapshot | null = null;

function captureVisual(): VisualSnapshot | null {
  try {
    const t = useThemeStore.getState();
    const d = useDockStore.getState();
    return {
      theme: t.theme,
      customAccentColor: t.customAccentColor,
      wallpaperUrl: t.wallpaperUrl,
      wallpaperFit: t.wallpaperFit,
      wallpaperOpacity: t.wallpaperOpacity,
      wallpaperBlur: t.wallpaperBlur,
      dockStyle: t.dockStyle,
      dockPosition: t.dockPosition,
      openIds: [...d.openIds],
      focusedId: d.activeToolId,
      besideIds: [...d.besideIds],
    };
  } catch {
    return null;
  }
}

function applyVisual(snap: VisualSnapshot): void {
  try {
    const t = useThemeStore.getState();
    t.setTheme(snap.theme as any);
    t.setCustomAccentColor((snap.customAccentColor as any) ?? null);
    if (snap.wallpaperUrl) {
      t.setWallpaper(snap.wallpaperUrl as string, {
        fit: snap.wallpaperFit as any,
        opacity: snap.wallpaperOpacity as number,
        blur: snap.wallpaperBlur as number,
      });
    } else t.clearWallpaper();
    t.setDockStyle(snap.dockStyle as any);
    t.setDockPosition(snap.dockPosition as any);
  } catch {
    // Best effort — never break tour teardown.
  }
  try {
    const d = useDockStore.getState();
    for (const id of d.openIds) {
      if (!snap.openIds.includes(id)) d.closeTool(id);
    }
    for (const id of snap.openIds) {
      if (!d.openIds.includes(id)) d.openTool(id);
    }
    d.setActiveTool(snap.focusedId);
    for (const id of d.besideIds) {
      if (!snap.besideIds.includes(id) && typeof d.closeBeside === "function") d.closeBeside(id);
    }
    for (const id of snap.besideIds) {
      if (!d.besideIds.includes(id) && typeof d.openBeside === "function") d.openBeside(id);
    }
  } catch {
    // Best effort.
  }
}

/** Snapshot once at Play start: full visual restore point. */
export function snapshotDockOnce(): void {
  if (!dockSnapshot) dockSnapshot = captureVisual();
}

/** Restore the pre-tour look and layout. */
export function restoreDockSnapshot(): void {
  if (!dockSnapshot) return;
  applyVisual(dockSnapshot);
  dockSnapshot = null;
}

/** Per-step entry snapshot for prev-step undo. */
let stepSnapshot: VisualSnapshot | null = null;

export function snapshotStep(): void {
  stepSnapshot = captureVisual();
}

/** Undo the current step's visual changes (theme + dock). */
export function undoDemoStep(): void {
  if (!stepSnapshot) return;
  applyVisual(stepSnapshot);
  stepSnapshot = null;
}

/** Full cleanup: restore pre-tour look + layout, delete demo data. */
export async function cleanupDemo(): Promise<void> {
  restoreThemeSnapshot();
  restoreDockSnapshot();
  await deleteDemoData();
  clearSpot();
}

/* ---------------- Spotlight (cursor/highlight ring) ----------------------- */

let spotSelector: string | null = null;
const spotListeners = new Set<() => void>();

export function spotTo(selector: string | null): void {
  spotSelector = selector;
  for (const fn of spotListeners) {
    try {
      fn();
    } catch {
      // Listener gone — dropped on next unsubscribe.
    }
  }
}

export function clearSpot(): void {
  spotTo(null);
}

export function subscribeSpot(fn: () => void): () => void {
  spotListeners.add(fn);
  return () => {
    spotListeners.delete(fn);
  };
}

export function getSpotSelector(): string | null {
  return spotSelector;
}

/** Snapshot once so the tour can leave no trace (repeatable for free). */
export function snapshotThemeOnce(): void {
  if (themeSnapshot) return;
  try {
    const t = useThemeStore.getState();
    themeSnapshot = {
      theme: t.theme,
      customAccentColor: t.customAccentColor,
      wallpaperUrl: t.wallpaperUrl,
      wallpaperFit: t.wallpaperFit,
      wallpaperOpacity: t.wallpaperOpacity,
      wallpaperBlur: t.wallpaperBlur,
      dockStyle: t.dockStyle,
      dockPosition: t.dockPosition,
    };
  } catch {
    themeSnapshot = null;
  }
}

/** Restore the pre-tour look; called when the tour closes. */
export function restoreThemeSnapshot(): void {
  if (!themeSnapshot) return;
  try {
    const t = useThemeStore.getState();
    const s = themeSnapshot as any;
    t.setTheme(s.theme);
    t.setCustomAccentColor(s.customAccentColor ?? null);
    if (s.wallpaperUrl) t.setWallpaper(s.wallpaperUrl, { fit: s.wallpaperFit, opacity: s.wallpaperOpacity, blur: s.wallpaperBlur });
    else t.clearWallpaper();
    t.setDockStyle(s.dockStyle);
    t.setDockPosition(s.dockPosition);
  } catch {
    // Best effort — never break tour teardown.
  } finally {
    themeSnapshot = null;
  }
}

const GIF_URL =
  "https://raw.githubusercontent.com/rachelvansciver/SpinningASCIIDonut/master/spinningdonut.gif";

/* ---------------- Per-step action scripts (typed, pausable) --------------- */


function stepActions(step: OnboardingStep): DemoAction[] {
  const prompt = (ONBOARDING_STEP_PROMPTS as Partial<Record<OnboardingStep, string>>)[step];
  const type = prompt ? [{ kind: "type", text: prompt } as DemoAction] : [];
  switch (step) {
    case "home":
      return [
        ...type,
        { kind: "say", text: "Meet Poly — this dock is operated, not decorated." },
        { kind: "spot", selector: '[data-dock-tool-id="store"]' },
        { kind: "beside", id: "store" },
        { kind: "wait", ms: 1800 },
        { kind: "beside", id: "creations" },
        { kind: "wait", ms: 1800 },
        { kind: "closeBeside" },
      ];
    case "customize":
      return [
        ...type,
        { kind: "say", text: "Watch the workspace change — themes, dock, background." },
        { kind: "beside", id: "settings" },
        { kind: "spot", selector: '[data-dock-tool-id="settings"]' },
        { kind: "theme", theme: "cyber", dockStyle: "lift" },
        { kind: "theme", theme: "amber", dockStyle: "solid" },
        { kind: "theme", theme: "amethyst", dockStyle: "bare" },
        { kind: "theme", theme: "void", dockStyle: "glass" },
        { kind: "wallpaper", url: GIF_URL, opacity: 0.25 },
        { kind: "say", text: "Settled back on the default look — GIF kept." },
        { kind: "closeBeside" },
      ];
    case "research":
      return [
        ...type,
        { kind: "say", text: "TinyFish is searching — watch the feed fill up." },
        { kind: "spot", selector: '[data-dock-tool-id="browser"]' },
        { kind: "beside", id: "browser" },
        {
          kind: "feedItems",
          items: DEMO_FIXTURES.map((f) => ({
            kind: f.kind,
            title: f.title,
            site: f.site,
            url: f.url,
            hook: f.hook,
            fullText: f.body,
            durationSec: f.durationSec ?? undefined,
          })),
        },
        { kind: "say", text: "Six real sources collected into the feed." },
        { kind: "closeBeside" },
      ];
    case "read": {
      const video = DEMO_FIXTURES.find((f) => f.kind === "video") ?? DEMO_FIXTURES[0];
      return [
        ...type,
        { kind: "say", text: "Video center stage, notes riding shotgun." },
        { kind: "open", id: "browser" },
        { kind: "reader", item: video },
        { kind: "wait", ms: 2000 },
        { kind: "beside", id: "notes" },
        { kind: "wait", ms: 2500 },
        { kind: "closeBeside" },
      ];
    }
    case "build":
      return [
        ...type,
        { kind: "say", text: "The dashboard mounts widget by widget, from the feed." },
        { kind: "beside", id: "creations" },
        { kind: "wait", ms: 1500 },
        { kind: "dashboard" },
        { kind: "wait", ms: 2500 },
        { kind: "closeBeside" },
      ];
    case "remember":
      return [
        ...type,
        { kind: "say", text: "Saving what matters — memory first, then the note." },
        { kind: "memoryDemo", text: "Hackathon demo; likes calm dark workspaces" },
        {
          kind: "note",
          title: "Demo notes",
          body: "Goal: hackathon demo. Setup: calm dark workspace, donut GIF background, research feed + dashboard.",
        },
        { kind: "beside", id: "notes" },
        { kind: "wait", ms: 2200 },
        { kind: "closeBeside" },
      ];
    case "handoff":
    case "idle":
      return [];
  }
}

async function runActions(step: OnboardingStep, actions: DemoAction[]): Promise<void> {
  for (const action of actions) {
    await runAction(step, action);
    await gate(step);
  }
}

/** Run one step's script. Returns true when it ran, false when there was
 *  nothing to do (handoff/idle) or a run for the same step is already in
 *  flight. Throws "demo-cancelled" when interrupted. */
export async function runDemoStep(step: OnboardingStep): Promise<boolean> {
  if (step === "handoff" || step === "idle") return false;
  // Re-entry guard: the view kick and the engine effect (x2 under
  // StrictMode) must not run the same step concurrently — the loser
  // would cancel the winner through the step gate.
  if (demoStepInFlight === step) {
    trace(step, "reentry-skipped");
    return false;
  }
  demoStepInFlight = step;
  trace(step, "start");
  // Ghost prompt: typed into the real composer for show, cleared at the
  // end — never sent, never in history, zero tokens.
  try {
    useConversationStore.getState().setDraft("");
  } catch {
    // Store unavailable — typing still narrates via thoughts.
  }
  // A breath before the action lands: the work that follows is real, but
  // instant local ops feel like teleporting without it.
  markBusy(true);
  pushThought("Poly is on it…");
  try {
    const reduce = reducedMotion();
    await pause(reduce ? 150 : 700);
    await runActions(step, stepActions(step));
    trace(step, "done");
    return true;
  } catch (err) {
    trace(step, "error", err instanceof Error ? err.message : "unknown");
    throw err instanceof Error ? err : new Error("demo-cancelled");
  } finally {
    try {
      useConversationStore.getState().setDraft("");
    } catch {
      // Best effort.
    }
    clearSpot();
    markBusy(false);
    if (demoStepInFlight === step) demoStepInFlight = null;
  }
}
