import type { AgentTool } from "./types";
import { open_source } from "./open_source";
import { search_web } from "./search_web";
import { fetch_page } from "./fetch_page";
import { find_capabilities } from "./find_capabilities";
import { invoke_capability } from "./invoke_capability";
import { inspect_experience } from "./inspect_experience";
import { promote_to_plugin } from "./promote_to_plugin";
import { inspect_execution } from "./inspect_execution";
import { list_recent_executions } from "./list_recent_executions";
import { create_plugin } from "./create_plugin";
import { modify_plugin } from "./modify_plugin";
import { operate_plugin } from "./operate_plugin";
import { publish_plugin } from "./publish_plugin";
import { apply_theme } from "./apply_theme";
import { list_files } from "./list_files";
import { read_file } from "./read_file";
import { write_file } from "./write_file";
import { edit_file } from "./edit_file";
import { search_files } from "./search_files";
import { recall_memory } from "./recall_memory";
import { record_memory } from "./record_memory";
import { read_skill } from "./read_skill";
import { dock_search } from "./dock_search";
import { search_icons } from "./search_icons";
import { list_icon_categories } from "./list_icon_categories";
import { dock_pin } from "./dock_pin";
import { dock_unpin } from "./dock_unpin";
import { dock_close } from "./dock_close";
import { generate_image } from "./generate_image";
import { install_plugin } from "./install_plugin";
import { rollback_plugin } from "./rollback_plugin";
import { list_sessions } from "./list_sessions";
import { inspect_session } from "./inspect_session";
import { list_tasks } from "./list_tasks";
import { list_artifacts } from "./list_artifacts";
import { read_artifact } from "./read_artifact";
import {
  sandbox_exec,
  sandbox_write_file,
  sandbox_read_file,
  sandbox_list_files,
  sandbox_serve,
  sandbox_logs,
  sandbox_status,
  sandbox_terminate,
} from "./sandbox";
// Verb tools (AGENT_SURFACE=minimal): dock.open/close/pin/unpin/list and
// plugins.create/edit/install/uninstall/operate — thin aliases over the
// current executors via the shared facade layer.
import { dockOpen, dockClose, dockPin, dockUnpin, dockList, dockFocus, dockNext, dockPrev, dockBackground, chatToggle } from "./verbs/dock";
import { pluginsCreate, pluginsEdit, pluginsInstall, pluginsUninstall, pluginsOperate, pluginsRollback, pluginsActivate, pluginsDeactivate } from "./verbs/plugins";
import { skillsRead } from "./verbs/skills";
import { config } from "../../config";
import { buildDynamicCapabilityTools } from "./catalog";

export * from "./types";
export {
  dock_search,
  search_icons,
  list_icon_categories,
  dock_pin,
  dock_unpin,
  dock_close,
  apply_theme,
  open_source,
  search_web,
  fetch_page,
  find_capabilities,
  invoke_capability,
  inspect_experience,
  promote_to_plugin,
  inspect_execution,
  list_recent_executions,
  create_plugin,
  modify_plugin,
  operate_plugin,
  publish_plugin,
  list_files,
  read_file,
  write_file,
  edit_file,
  search_files,
  recall_memory,
  record_memory,
  read_skill,
  generate_image,
  install_plugin,
  rollback_plugin,
  list_sessions,
  inspect_session,
  list_tasks,
  list_artifacts,
  read_artifact,
  sandbox_exec,
  sandbox_write_file,
  sandbox_read_file,
  sandbox_list_files,
  sandbox_serve,
  sandbox_logs,
  sandbox_status,
  sandbox_terminate,
  // Verb family (aliases stay importable; registry below decides).
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
  dockFocus,
  dockNext,
  dockPrev,
  dockBackground,
  chatToggle,
  pluginsCreate,
  pluginsEdit,
  pluginsInstall,
  pluginsUninstall,
  pluginsOperate,
  pluginsRollback,
  pluginsActivate,
  pluginsDeactivate,
  skillsRead,
};

export type AgentSurface = "full" | "minimal";

/**
 * Single source of truth for the static tool catalog (#204). Every tool
 * is listed once with the surfaces that offer it; `fullTools` and
 * `minimalTools` are derived views, not parallel catalogs. Surface
 * selection composes with (never duplicates) the downstream mechanisms:
 * intent denylists filter the scoped set in the loop, native tool search
 * groups it into namespaces (#222), and dynamic capability tools merge in
 * via `resolveTools` — all three consume this one list.
 *
 * `plugins.install` ships on every surface (install_plugin on full,
 * pluginsInstall on minimal).
 */
const canonicalCatalog: Array<{ tool: AgentTool; surfaces: AgentSurface[] }> = [
  { tool: dock_search, surfaces: ["full"] },
  { tool: search_icons, surfaces: ["full"] },
  { tool: list_icon_categories, surfaces: ["full"] },
  { tool: dock_pin, surfaces: ["full"] },
  { tool: dock_unpin, surfaces: ["full"] },
  { tool: dock_close, surfaces: ["full"] },
  { tool: apply_theme, surfaces: ["full"] },
  { tool: open_source, surfaces: ["full"] },
  { tool: search_web, surfaces: ["full"] },
  { tool: fetch_page, surfaces: ["full"] },
  { tool: find_capabilities, surfaces: ["full", "minimal"] },
  { tool: invoke_capability, surfaces: ["full"] },
  { tool: inspect_experience, surfaces: ["full"] },
  { tool: promote_to_plugin, surfaces: ["full"] },
  { tool: inspect_execution, surfaces: ["full"] },
  { tool: list_recent_executions, surfaces: ["full"] },
  { tool: create_plugin, surfaces: ["full"] },
  { tool: modify_plugin, surfaces: ["full"] },
  { tool: operate_plugin, surfaces: ["full"] },
  { tool: publish_plugin, surfaces: ["full"] },
  { tool: list_files, surfaces: ["full"] },
  { tool: read_file, surfaces: ["full"] },
  { tool: write_file, surfaces: ["full"] },
  { tool: edit_file, surfaces: ["full"] },
  { tool: search_files, surfaces: ["full"] },
  { tool: recall_memory, surfaces: ["full"] },
  { tool: record_memory, surfaces: ["full"] },
  { tool: read_skill, surfaces: ["full"] },
  { tool: generate_image, surfaces: ["full"] },
  { tool: install_plugin, surfaces: ["full"] },
  { tool: rollback_plugin, surfaces: ["full"] },
  { tool: list_sessions, surfaces: ["full"] },
  { tool: inspect_session, surfaces: ["full"] },
  { tool: list_tasks, surfaces: ["full"] },
  { tool: list_artifacts, surfaces: ["full"] },
  { tool: read_artifact, surfaces: ["full"] },
  { tool: sandbox_exec, surfaces: ["full"] },
  { tool: sandbox_write_file, surfaces: ["full"] },
  { tool: sandbox_read_file, surfaces: ["full"] },
  { tool: sandbox_list_files, surfaces: ["full"] },
  { tool: sandbox_serve, surfaces: ["full"] },
  { tool: sandbox_logs, surfaces: ["full"] },
  { tool: sandbox_status, surfaces: ["full"] },
  { tool: sandbox_terminate, surfaces: ["full"] },
  { tool: dockOpen, surfaces: ["minimal"] },
  { tool: dockClose, surfaces: ["minimal"] },
  { tool: dockPin, surfaces: ["minimal"] },
  { tool: dockUnpin, surfaces: ["minimal"] },
  { tool: dockList, surfaces: ["minimal"] },
  { tool: dockFocus, surfaces: ["minimal"] },
  { tool: dockNext, surfaces: ["minimal"] },
  { tool: dockPrev, surfaces: ["minimal"] },
  { tool: dockBackground, surfaces: ["minimal"] },
  { tool: chatToggle, surfaces: ["minimal"] },
  { tool: pluginsCreate, surfaces: ["minimal"] },
  { tool: pluginsEdit, surfaces: ["minimal"] },
  { tool: pluginsInstall, surfaces: ["minimal"] },
  { tool: pluginsUninstall, surfaces: ["minimal"] },
  { tool: pluginsOperate, surfaces: ["minimal"] },
  { tool: pluginsRollback, surfaces: ["minimal"] },
  { tool: pluginsActivate, surfaces: ["minimal"] },
  { tool: pluginsDeactivate, surfaces: ["minimal"] },
  { tool: skillsRead, surfaces: ["minimal"] },
];

function toolsFor(surface: AgentSurface): AgentTool[] {
  return canonicalCatalog.filter((e) => e.surfaces.includes(surface)).map((e) => e.tool);
}

/**
 * Minimal verb catalog (AGENT_SURFACE=minimal): dock.open/close/pin/unpin/
 * list/focus/next/prev/background + chat.toggle + plugins.create/edit/install/uninstall/operate
 * + find_capabilities (progressive disclosure root: intent loads more).
 * plugins.install ships on every surface.
 */
export const minimalTools: AgentTool[] = toolsFor("minimal");

export const fullTools: AgentTool[] = toolsFor("full");
export const defaultTools: AgentTool[] =
  config.AGENT_SURFACE === "minimal" ? minimalTools : fullTools;

/** The unified inventory: every static tool exactly once. */
export function canonicalTools(): AgentTool[] {
  return canonicalCatalog.map((e) => e.tool);
}

export { buildDynamicCapabilityTools, capabilityToolName, generatedCatalogSnapshot } from "./catalog";

/**
 * Runtime resolution: static base plus any capability-derived tools not
 * already present. Registering a new capability exposes its tool with no
 * edit to a catalog file; the loop calls this per turn.
 */
export function resolveTools(base: AgentTool[] = defaultTools): AgentTool[] {
  const names = new Set(base.map((t) => t.name));
  const out = [...base];
  try {
    for (const t of buildDynamicCapabilityTools()) {
      if (!names.has(t.name)) {
        names.add(t.name);
        out.push(t);
      }
    }
  } catch {
    // Non-fatal: static catalog still works.
  }
  return out;
}
