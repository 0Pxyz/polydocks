import { describe, it, expect, beforeEach } from "bun:test";
import { useNavigationStore } from "../src/lib/store/useNavigationStore";
import { useProfileStore } from "../src/lib/store/useProfileStore";
import { useDockStore } from "../src/lib/store/useDockStore";

describe("City Workspace Navigation & State Transitions", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      viewMode: "world",
      activeCityId: null,
      camera: { x: 0, y: 0, zoom: 1 },
    });
    useProfileStore.setState({
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      streak: 1,
      completedQuestIds: [],
    });
    useDockStore.setState({
      activeToolId: null,
      isExpanded: false,
      sideBySide: false,
      pinnedToolIds: ["agent", "terminal", "notes", "sources", "quests"],
    });
  });

  it("navigates seamlessly between world view and city workspace", () => {
    const nav = useNavigationStore.getState();
    expect(nav.viewMode).toBe("world");
    expect(nav.activeCityId).toBeNull();

    // Enter city
    nav.enterCity("quantum-computing");
    const cityState = useNavigationStore.getState();
    expect(cityState.viewMode).toBe("city");
    expect(cityState.activeCityId).toBe("quantum-computing");

    // Exit back to world map
    cityState.exitToWorld();
    const worldState = useNavigationStore.getState();
    expect(worldState.viewMode).toBe("world");
    expect(worldState.activeCityId).toBeNull();
  });

  it("tracks camera coordinates during world exploration without affecting city state", () => {
    useNavigationStore.getState().setCamera({ x: 150, y: -80, zoom: 1.5 });
    expect(useNavigationStore.getState().camera).toEqual({ x: 150, y: -80, zoom: 1.5 });

    useNavigationStore.getState().enterCity("neural-networks");
    expect(useNavigationStore.getState().viewMode).toBe("city");
    expect(useNavigationStore.getState().camera.zoom).toBe(1.5);
  });

  it("completing a city quest awards player XP and updates player progression", () => {
    const profile = useProfileStore.getState();
    expect(profile.level).toBe(1);
    expect(profile.xp).toBe(0);

    // Complete a 100 XP quest in city
    profile.completeQuest("quest-quantum-basics", 100);
    const updated = useProfileStore.getState();
    expect(updated.level).toBe(2);
    expect(updated.xp).toBe(0);
    expect(updated.completedQuests).toContain("quest-quantum-basics");

    // Complete a 150 XP quest (adds to level 2 with 200 xp threshold: 150 / 200)
    updated.completeQuest("quest-quantum-sota", 150);
    const nextLevel = useProfileStore.getState();
    expect(nextLevel.level).toBe(2);
    expect(nextLevel.xp).toBe(150);
    expect(nextLevel.xpToNextLevel).toBe(200);
  });

  it("coordinates dock tool selection within the active city workspace", () => {
    const dock = useDockStore.getState();
    expect(dock.activeToolId).toBeNull();
    expect(dock.isExpanded).toBe(false);

    // Select notes tool
    dock.setActiveTool("notes");
    dock.setExpanded(true);
    expect(useDockStore.getState().activeToolId).toBe("notes");
    expect(useDockStore.getState().isExpanded).toBe(true);

    // Deselect notes tool
    dock.setActiveTool(null);
    dock.setExpanded(false);
    expect(useDockStore.getState().activeToolId).toBeNull();
    expect(useDockStore.getState().isExpanded).toBe(false);
  });

  it("formats city slugs into human-readable titles cleanly", () => {
    const format = (slug: string) =>
      slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    expect(format("neural-networks")).toBe("Neural Networks");
    expect(format("transformer-architectures")).toBe("Transformer Architectures");
    expect(format("quantum-computing")).toBe("Quantum Computing");
  });
});
