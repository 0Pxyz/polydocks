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
import { pluginsCreate, pluginsEdit, pluginsInstall, pluginsUninstall, pluginsOperate, pluginsRollback } from "./verbs/plugins";
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
};

/**
 * The canonical catalog of default Agent tools (AGENT_SURFACE=full).
 */
const fullToolsList: AgentTool[] = [
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
];

/**
 * Minimal verb catalog (AGENT_SURFACE=minimal): dock.open/close/pin/unpin/
 * list/focus/next/prev/background + chat.toggle + plugins.create/edit/install/uninstall/operate.
 */
export const minimalTools: AgentTool[] = [
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
];

export const fullTools: AgentTool[] = fullToolsList;
export const defaultTools: AgentTool[] =
  config.AGENT_SURFACE === "minimal" ? minimalTools : fullToolsList;

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
