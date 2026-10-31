import { describe, it, expect, beforeEach } from "bun:test";
import { platformStorage } from "../src/lib/platform/storage";
import { openExternalUrl } from "../src/lib/platform/window";
import { useProfileStore } from "../src/lib/store/useProfileStore";
import { useDockStore } from "../src/lib/store/useDockStore";

describe("Platform Abstraction Layer & Storage", () => {
  beforeEach(() => {
    platformStorage.clear();
  });

  it("stores and retrieves typed JSON values with platformStorage", () => {
    // 1. Objects
    platformStorage.setItem("user-theme", { mode: "dark", accent: "#C8FF57" });
    const theme = platformStorage.getItem<{ mode: string; accent: string }>("user-theme");
    expect(theme).toEqual({ mode: "dark", accent: "#C8FF57" });

    // 2. Arrays
    platformStorage.setItem("pinned-items", ["a", "b", "c"]);
    const items = platformStorage.getItem<string[]>("pinned-items");
    expect(items).toEqual(["a", "b", "c"]);

    // 3. Fallback default value
    const nonExistent = platformStorage.getItem("missing-key", "default-val");
    expect(nonExistent).toBe("default-val");

    // 4. Removal
    platformStorage.removeItem("user-theme");
    expect(platformStorage.getItem("user-theme")).toBeNull();
  });

  it("clears storage keys selectively by prefix", () => {
    platformStorage.setItem("ws:athens:notes", "notes data");
    platformStorage.setItem("ws:athens:sources", "sources data");
    platformStorage.setItem("global:settings", "settings data");

    const athensKeys = platformStorage.getAllKeys("ws:athens");
    expect(athensKeys.length).toBe(2);

    platformStorage.clear("ws:athens");

    expect(platformStorage.getItem("ws:athens:notes")).toBeNull();
    expect(platformStorage.getItem("global:settings")).toBe("settings data");
  });

  it("strictly enforces safe protocols in openExternalUrl", () => {
    // Dangerous protocols blocked
    expect(openExternalUrl("javascript:alert(1)")).toBe(false);
    expect(openExternalUrl("data:text/html,<script>steal()</script>")).toBe(false);
    expect(openExternalUrl("file:///etc/passwd")).toBe(false);
    expect(openExternalUrl("vbscript:msgbox()")).toBe(false);
    expect(openExternalUrl("")).toBe(false);

    // Valid URLs permitted
    expect(openExternalUrl("https://dev.meta.ai")).toBe(true);
    expect(openExternalUrl("http://localhost:3000")).toBe(true);
  });
});

describe("Foundational Zustand Stores", () => {
  beforeEach(() => {
    useProfileStore.getState().resetProfile();
    useDockStore.getState().resetDock();
  });

  it("tracks level, XP progression, and quest completions with useProfileStore", () => {
    const profile = useProfileStore.getState();
    expect(profile.level).toBe(1);
    expect(profile.xp).toBe(0);
    expect(profile.xpToNextLevel).toBe(100);

    // Add XP without level up
    useProfileStore.getState().addXp(60);
    expect(useProfileStore.getState().level).toBe(1);
    expect(useProfileStore.getState().xp).toBe(60);

    // Add XP triggering level up (60 + 50 = 110 >= 100 -> level 2, 10 XP remainder, 200 to next level)
    useProfileStore.getState().addXp(50);
    expect(useProfileStore.getState().level).toBe(2);
    expect(useProfileStore.getState().xp).toBe(10);
    expect(useProfileStore.getState().xpToNextLevel).toBe(200);

    // Complete quest
    useProfileStore.getState().completeQuest("quest-stoic-101", 100);
    expect(useProfileStore.getState().completedQuests).toContain("quest-stoic-101");
    expect(useProfileStore.getState().xp).toBe(110);

    // Duplicate quest completion does not award XP twice
    useProfileStore.getState().completeQuest("quest-stoic-101", 100);
    expect(useProfileStore.getState().xp).toBe(110);
  });

  it("controls dock tool focus, expansion, and pinning with useDockStore", () => {
    const dock = useDockStore.getState();
    expect(dock.activeToolId).toBe("agent");
    expect(dock.isExpanded).toBe(false);

    // Switch tool
    useDockStore.getState().setActiveTool("terminal");
    expect(useDockStore.getState().activeToolId).toBe("terminal");

    // Toggle expansion
    useDockStore.getState().toggleExpanded();
    expect(useDockStore.getState().isExpanded).toBe(true);

    useDockStore.getState().setExpanded(false);
    expect(useDockStore.getState().isExpanded).toBe(false);

    // Toggle side by side layout
    useDockStore.getState().toggleSideBySide();
    expect(useDockStore.getState().sideBySide).toBe(true);

    // Pin and unpin tools
    useDockStore.getState().pinTool("flashcards");
    expect(useDockStore.getState().pinnedToolIds).toContain("flashcards");

    useDockStore.getState().unpinTool("flashcards");
    expect(useDockStore.getState().pinnedToolIds).not.toContain("flashcards");
  });
});
