import { describe, expect, it } from "bun:test";
import {
  fullTools,
  minimalTools,
  open_source,
} from "./index";

describe("Agent Tool Catalog & Security Guards", () => {
  it("should export all canonical tools in fullTools catalog", () => {
    expect(fullTools.length).toBe(43);
    const names = fullTools.map((t) => t.name);
    expect(names).toContain("dock_search");
    expect(names).toContain("dock_pin");
    expect(names).toContain("dock_unpin");
    expect(names).toContain("dock_close");
    expect(names).toContain("open_source");
    expect(names).toContain("search_web");
    expect(names).toContain("fetch_page");
    expect(names).toContain("create_plugin");
    expect(names).toContain("modify_plugin");
    expect(names).toContain("operate_plugin");
    expect(names).toContain("publish_plugin");
    expect(names).toContain("find_capabilities");
    expect(names).toContain("invoke_capability");
    expect(names).toContain("inspect_experience");
    expect(names).toContain("promote_to_plugin");
    expect(names).toContain("inspect_execution");
    expect(names).toContain("list_recent_executions");
    expect(names).toContain("list_files");
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("search_files");
    expect(names).toContain("recall_memory");
    expect(names).toContain("record_memory");
    expect(names).toContain("apply_theme");
    expect(names).toContain("generate_image");
    expect(names).toContain("install_plugin");
    expect(names).toContain("rollback_plugin");
    expect(names).toContain("list_sessions");
    expect(names).toContain("inspect_session");
    expect(names).toContain("list_tasks");
    expect(names).toContain("list_artifacts");
    expect(names).toContain("read_artifact");
    expect(names).toContain("sandbox_exec");
    expect(names).toContain("sandbox_write_file");
    expect(names).toContain("sandbox_read_file");
    expect(names).toContain("sandbox_list_files");
    expect(names).toContain("sandbox_serve");
    expect(names).toContain("sandbox_logs");
    expect(names).toContain("sandbox_status");
    expect(names).toContain("sandbox_terminate");
    // Legacy tabs and world cartography are gone (parked branch).
    for (const gone of [
      "list_tabs",
      "open_tab",
      "open_intent",
      "enter_city",
      "inspect_tab",
      "close_tray",
      "create_tab",
      "update_tab",
      "delete_tab",
      "get_city_context",
      "read_city_file",
      "write_city_file",
      "plan_map",
      "build_city",
      "list_maps",
      "set_map",
      "place_city",
      "connect_cities",
      "plan_ascii_world",
    ]) {
      expect(names).not.toContain(gone);
    }
  });
  it("minimal surface is the verb tools", () => {
    const names = minimalTools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "chat.toggle",
        "dock.background",
        "dock.close",
        "dock.focus",
        "dock.list",
        "dock.next",
        "dock.open",
        "dock.pin",
        "dock.prev",
        "dock.unpin",
        "find_capabilities",
        "plugins.create",
        "plugins.edit",
        "plugins.install",
        "plugins.operate",
        "plugins.rollback",
        "plugins.uninstall",
      ].sort()
    );
    expect(fullTools.length).toBe(43);
    expect(fullTools.map((t) => t.name)).not.toContain("dock.open");
  });

  it("open_source validates URLs", async () => {
    const res = (await open_source.execute(
      { url: "https://arxiv.org/abs/2301.12345", title: "arXiv Paper" },
      { workspaceId: "test", step: 1 }
    )) as any;

    expect(res.action).toBe("browser.open");
    expect(res.url).toBe("https://arxiv.org/abs/2301.12345");
  });
});
