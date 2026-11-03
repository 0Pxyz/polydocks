import type { UIEvent } from "./events";
import { buildMemoryChipContent } from "./events";
import { useConversationStore } from "./conversationStore";
import { useDockStore } from "../store/useDockStore";
import { useNotesNavStore } from "../store/useNotesNavStore";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useThemeStore, THEMES, type ThemeId, type DockStyleId, type DockPosition } from "@/lib/theme";
import { DOCK_TOOL_DESCRIPTIONS } from "../dock/dockModel";
import { chatPlacement } from "../dock/dockItems";
import { applyReaderOpened } from "./conversationStore";

export interface OrchestratorActionCallbacks {
  onExperienceCreated?: (exp: { id: string; title: string; icon?: string }) => void;
  onOpenExperience?: (expId: string) => void;
  onCloseExperience?: (expId: string) => void;
}

/**
 * Agent action effects shared by the legacy streaming turn and the
 * orchestrator SSE path: dock/plugin/theme/reader/source effects.
 * Pure UI application of server-verified outcomes — no streaming state.
 * Every orchestrator-forwarded loop event funnels through here so both
 * paths behave identically.
 */
export async function applyOrchestratorAction(
  event: UIEvent,
  callbacks?: OrchestratorActionCallbacks,
  isDockAdd: boolean = false
): Promise<void> {
  const { set } = { set: useConversationStore.setState };
  switch (event.type) {
    case "experience.created": {
      callbacks?.onExperienceCreated?.(event.experience);
      set({
        isBuildingTool: false,
        statusText: `Mounted "${event.experience.title}" in the dock.`,
      });
      break;
    }

    case "plugin.created":
    case "plugin.updated": {
      const isNew = event.type === "plugin.created";
      // Refresh the registry in the background: mount callbacks stay
      // synchronous so streamed plugin.created mounts immediately (same
      // timing as the legacy mountPluginFromPayload path).
      try {
        const targetWorkspace =
          (event as { workspaceId?: string }).workspaceId ||
          useWorkspaceStore.getState().activeWorkspaceId ||
          "default";
        void useWorkspaceStore.getState().fetchWorkspacePlugins(targetWorkspace).catch(() => {});
      } catch {
        // Non-fatal: dock mount below still shows the tool
      }
      callbacks?.onExperienceCreated?.({
        id: event.plugin.id,
        title: event.plugin.title,
        icon: event.plugin.icon,
      });
      set({
        isBuildingTool: false,
        statusText: isNew ? `Mounted "${event.plugin.title}" in the dock.` : `Updated "${event.plugin.title}".`,
      });
      callbacks?.onOpenExperience?.(event.plugin.id);
      if (!isDockAdd) {
        if (typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side") {
          set({ layoutState: "side" });
        } else {
          set({ layoutState: "closed" });
        }
      }
      break;
    }

    case "plugin.published": {
      set({
        isBuildingTool: false,
        statusText: `Published "${event.plugin.title}" to the store.`,
      });
      break;
    }

    case "plugin.operated": {
      set({
        statusText: event.action ? `Ran "${event.action}".` : "Done.",
      });
      break;
    }

    case "dock.open_experience": {
      set({ statusText: `Opening "${event.experienceId}"…` });
      if (event.noteId) useNotesNavStore.getState().requestNote(event.noteId);
      callbacks?.onOpenExperience?.(event.experienceId);
      if (!isDockAdd) {
        if (typeof window !== "undefined" && chatPlacement(window.innerWidth) === "side") {
          set({ layoutState: "side" });
        } else {
          set({ layoutState: "closed" });
        }
      }
      break;
    }

    case "dock.layout": {
      if (!event.success) {
        set({ statusText: event.message || `Couldn't change the dock.` });
        break;
      }
      const dock = useDockStore.getState();
      const knownIds = new Set([
        ...Object.keys(DOCK_TOOL_DESCRIPTIONS),
        ...useWorkspaceStore.getState().workspacePlugins.map((wp) => wp.pluginId),
        ...dock.pinnedToolIds,
        ...dock.openIds,
        event.itemId,
      ]);
      const result = dock.applyDirective({ op: event.op, id: event.itemId }, knownIds);
      if (event.op === "close" && result.ok) {
        callbacks?.onCloseExperience?.(event.itemId);
      }
      set({
        statusText: result.ok ? result.message : `Couldn't ${event.op} "${event.itemId}": ${result.message}`,
      });
      break;
    }

    case "reader.open": {
      applyReaderOpened(event);
      break;
    }

    case "source.added": {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("polymax:source.added", { detail: event.source }));
      }
      break;
    }

    case "theme.applied":
      await applyOrchestratorTheme(event);
      break;

    case "tool.completed": {
      // Memory badge (#105): one subtle transcript line when the agent
      // records a memory. Ephemeral by design — thread persistence stays
      // user/assistant/system. Id is stable so replays never duplicate.
      if (event.name === "record_memory") {
        const chip = buildMemoryChipContent(event.result);
        if (chip) {
          const id = `mem-${event.id || `${event.step}-${Date.now()}`}`;
          set((state) => {
            if (state.messages.some((m) => m.id === id)) return state;
            return {
              messages: [
                ...state.messages,
                { id, role: "tool" as const, toolName: event.name, content: chip, timestamp: Date.now() },
              ],
            };
          });
        }
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Applies a verified theme change. Explicit fields first; when only a
 * wallpaper arrives, the UI complements the theme from the actual image
 * (dominant color → nearest theme family + complementary accent).
 * Reads the live store back afterwards so the status reflects reality.
 */
async function applyOrchestratorTheme(event: {
  applied?: Record<string, unknown>;
  attachmentId?: string;
}): Promise<void> {
  const { set, get } = { set: useConversationStore.setState, get: useConversationStore.getState };
  const applied = event.applied || {};
  const failures: string[] = [];

  let wallpaperUrl = typeof applied.wallpaperUrl === "string" ? applied.wallpaperUrl : undefined;
  if (!wallpaperUrl && event.attachmentId) {
    const lastUser = [...get().messages].reverse().find((m) => m.role === "user");
    const match = lastUser?.attachments?.find((a) => a.id === event.attachmentId);
    if (match?.dataUrl) {
      wallpaperUrl = match.dataUrl;
    } else {
      failures.push("couldn't resolve the attached image — please re-attach it");
    }
  }

  let theme = typeof applied.theme === "string" ? applied.theme : undefined;
  let accentColor = typeof applied.accentColor === "string" ? applied.accentColor : undefined;
  // Complement only when the model gave no explicit look, and only in a
  // browser (happy-dom/bun lack canvas). Failures here never fail the turn:
  // the wallpaper itself still applies and gets verified below.
  if (wallpaperUrl && !theme && !accentColor && typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const complement = await complementThemeFromWallpaper(wallpaperUrl);
      if (complement) {
        theme = complement.theme;
        accentColor = complement.accentColor;
      }
    } catch {
      // Best-effort only.
    }
  }

  try {
    const themeApi = useThemeStore.getState();
    if (theme !== undefined) {
      if (THEMES.some((t) => t.id === theme)) {
        themeApi.setTheme(theme as ThemeId);
      } else {
        failures.push(`unknown theme "${theme}"`);
      }
    }
    if (accentColor !== undefined) {
      if (typeof accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(accentColor)) {
        themeApi.setCustomAccentColor(accentColor);
      } else {
        failures.push(`invalid accent color "${accentColor}"`);
      }
    }
    if (applied.dockStyle !== undefined) {
      const valid = ["glass", "solid", "bare", "lift"] as const;
      if (typeof applied.dockStyle === "string" && (valid as readonly string[]).includes(applied.dockStyle)) {
        themeApi.setDockStyle(applied.dockStyle as DockStyleId);
      } else {
        failures.push(`unknown dock style "${applied.dockStyle}"`);
      }
    }
    if (applied.dockPosition !== undefined) {
      if (applied.dockPosition === "top" || applied.dockPosition === "bottom") {
        themeApi.setDockPosition(applied.dockPosition as DockPosition);
      } else {
        failures.push(`unknown dock position "${applied.dockPosition}"`);
      }
    }
    if (applied.clearWallpaper === true) {
      themeApi.clearWallpaper();
    } else if (wallpaperUrl) {
      const fit = applied.wallpaperFit === "cover" || applied.wallpaperFit === "contain" || applied.wallpaperFit === "tile" ? applied.wallpaperFit : undefined;
      const opacity = typeof applied.wallpaperOpacity === "number" ? applied.wallpaperOpacity : undefined;
      const blur = typeof applied.wallpaperBlur === "number" ? applied.wallpaperBlur : undefined;
      themeApi.setWallpaper(wallpaperUrl, { fit, opacity, blur });
    }
  } catch (err: any) {
    failures.push(err?.message || "theme store unavailable");
  }

  const live = useThemeStore.getState();
  const mismatches: string[] = [];
  if (theme !== undefined && live.theme !== theme) mismatches.push("theme");
  if (accentColor !== undefined && live.customAccentColor !== accentColor) mismatches.push("accent");
  if (wallpaperUrl && live.wallpaperUrl !== wallpaperUrl) mismatches.push("wallpaper");
  const problems = [...failures, ...mismatches.map((m) => `${m} did not persist`)];

  if (problems.length === 0) {
    set({ isBuildingTool: false, statusText: "Theme updated — verified in the live theme store." });
  } else {
    const message = `Theme partially applied: ${problems.join("; ")}.`;
    set((state) => {
      const updatedMessages = [...state.messages];
      const lastMsg = updatedMessages[updatedMessages.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        lastMsg.error = { message };
      }
      return { isBuildingTool: false, statusText: message, messages: updatedMessages };
    });
  }
}

/** Dominant color → nearest theme family + complementary accent (browser-only). */
async function complementThemeFromWallpaper(url: string): Promise<{ theme: ThemeId; accentColor: string } | null> {
  const probe = await new Promise<{ h: number; s: number; l: number } | null>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = window.setTimeout(() => resolve(null), 8000);
      img.onload = () => {
        try {
          window.clearTimeout(timer);
          const size = 32;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const pixels = ctx.getImageData(0, 0, size, size).data;
          let r = 0,
            g = 0,
            b = 0,
            n = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 128) continue;
            r += pixels[i];
            g += pixels[i + 1];
            b += pixels[i + 2];
            n++;
          }
          if (n === 0) {
            resolve(null);
            return;
          }
          resolve(rgbToHsl(r / n, g / n, b / n));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
  if (!probe) return null;
  const { h, s, l } = probe;
  const theme: ThemeId =
    s < 0.12 ? "void" : h >= 15 && h < 55 ? "amber" : h >= 160 && h < 210 ? "cyber" : h >= 250 && h < 310 ? "amethyst" : "void";
  const complementary = (((Math.round(h) + 180) % 360) + 360) % 360;
  const accentColor = hslToHex(complementary, Math.min(0.85, Math.max(0.45, s)), l < 0.2 ? 0.55 : Math.min(0.65, Math.max(0.45, l)));
  return { theme, accentColor };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
