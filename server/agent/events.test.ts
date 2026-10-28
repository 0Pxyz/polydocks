import { describe, it, expect } from "bun:test";
import { adaptBackendEvent, getFriendlyToolStatus } from "../../src/lib/agent/events";

describe("Agent UI Event Adapter & Vocabulary Guard", () => {
  it("maps tool names to friendly status lines", () => {
    expect(getFriendlyToolStatus("search_web", { query: "Quantum physics" })).toContain("Quantum physics");
    expect(getFriendlyToolStatus("create_tab", { title: "Flashcards" })).toContain("Flashcards");
    expect(getFriendlyToolStatus("list_tabs")).toBe("Checking available dock experiences…");
    expect(getFriendlyToolStatus("open_tab")).toBe("Opening experience in workspace…");
    expect(getFriendlyToolStatus("close_tray")).toBe("Minimizing workspace surface…");
    expect(getFriendlyToolStatus("get_city_context")).toBe("Loading city knowledge base…");
  });

  it("adapts backend tab.created to experience.created", () => {
    const uiEvt = adaptBackendEvent({
      type: "tab.created",
      step: 1,
      payload: { id: "flashcards-1", title: "Flashcards", icon: "Clock" },
    });
    expect(uiEvt).not.toBeNull();
    expect(uiEvt?.type).toBe("experience.created");
    if (uiEvt?.type === "experience.created") {
      expect(uiEvt.experience.id).toBe("flashcards-1");
      expect(uiEvt.experience.title).toBe("Flashcards");
    }
  });

  it("adapts backend tray.open to dock.open_experience", () => {
    const uiEvt = adaptBackendEvent({
      type: "tray.open",
      step: 2,
      payload: { id: "flashcards-1" },
    });
    expect(uiEvt?.type).toBe("dock.open_experience");
    if (uiEvt?.type === "dock.open_experience") {
      expect(uiEvt.experienceId).toBe("flashcards-1");
    }
  });

  it("adapts backend tab.prime to experience.primed", () => {
    const uiEvt = adaptBackendEvent({
      type: "tab.prime",
      step: 3,
      payload: {
        tabId: "browser",
        url: "https://arxiv.org/abs/quant-ph/0201082",
        payload: { kind: "paper", title: "Quantum Teleportation" },
      },
    });
    expect(uiEvt?.type).toBe("experience.primed");
    if (uiEvt?.type === "experience.primed") {
      expect(uiEvt.experienceId).toBe("browser");
      expect(uiEvt.url).toBe("https://arxiv.org/abs/quant-ph/0201082");
      expect(uiEvt.payload?.title).toBe("Quantum Teleportation");
    }
  });

  it("detects delete_tab approval requirement and maps to approval.required", () => {
    const uiEvt = adaptBackendEvent({
      type: "tool.done",
      step: 3,
      payload: {
        name: "delete_tab",
        result: {
          status: "approval_required",
          requiresConfirmation: true,
          tabId: "custom-tool",
          message: "Deletion paused: user approval required",
        },
      },
    });
    expect(uiEvt?.type).toBe("approval.required");
    if (uiEvt?.type === "approval.required") {
      expect(uiEvt.approval.toolName).toBe("delete_tab");
      expect(uiEvt.approval.experienceId).toBe("custom-tool");
    }
  });
});
