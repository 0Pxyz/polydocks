import type { AgentTool } from "./types";
import { list_tabs } from "./list_tabs";
import { open_tab } from "./open_tab";
import { open_intent } from "./open_intent";
import { enter_city } from "./enter_city";
import { inspect_tab } from "./inspect_tab";
import { close_tray } from "./close_tray";
import { create_tab } from "./create_tab";
import { update_tab } from "./update_tab";
import { delete_tab } from "./delete_tab";
import { get_city_context } from "./get_city_context";
import { read_city_file } from "./read_city_file";
import { write_city_file } from "./write_city_file";
import { open_source } from "./open_source";
import { search_web } from "./search_web";
import { fetch_page } from "./fetch_page";
import { plan_map } from "./plan_map";
import { build_city } from "./build_city";
import { list_maps } from "./list_maps";
import { set_map } from "./set_map";
import { place_city } from "./place_city";
import { find_capabilities } from "./find_capabilities";
import { invoke_capability } from "./invoke_capability";
import { inspect_experience } from "./inspect_experience";
import { promote_to_plugin } from "./promote_to_plugin";
import { inspect_execution } from "./inspect_execution";
import { list_recent_executions } from "./list_recent_executions";
import { create_plugin } from "./create_plugin";
import { connect_cities } from "./connect_cities";
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
import { plan_ascii_world } from "./plan_ascii_world";
import { dock_search } from "./dock_search";
import { dock_pin } from "./dock_pin";
import { dock_unpin } from "./dock_unpin";
import { dock_close } from "./dock_close";
import { generate_image } from "./generate_image";
// Verb tools (AGENT_SURFACE=minimal): dock.open/close/pin/unpin/list and
// plugins.create/edit/install/uninstall/operate — thin aliases over the
// current executors via the shared facade layer.
import { dockOpen, dockClose, dockPin, dockUnpin, dockList } from "./verbs/dock";
import { pluginsCreate, pluginsEdit, pluginsInstall, pluginsUninstall, pluginsOperate } from "./verbs/plugins";
import { config } from "../../config";

export * from "./types";
export {
  list_tabs,
  open_tab,
  open_intent,
  enter_city,
  inspect_tab,
  close_tray,
  dock_search,
  dock_pin,
  dock_unpin,
  dock_close,
  apply_theme,
  create_tab,
  update_tab,
  delete_tab,
  get_city_context,
  read_city_file,
  write_city_file,
  open_source,
  search_web,
  fetch_page,
  plan_map,
  build_city,
  list_maps,
  set_map,
  place_city,
  find_capabilities,
  invoke_capability,
  inspect_experience,
  promote_to_plugin,
  inspect_execution,
  list_recent_executions,
  create_plugin,
  connect_cities,
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
  plan_ascii_world,
  generate_image,
  // Verb family (aliases stay importable; registry below decides).
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
  pluginsCreate,
  pluginsEdit,
  pluginsInstall,
  pluginsUninstall,
  pluginsOperate,
};

/**
 * The canonical catalog of default Agent tools (AGENT_SURFACE=full).
 */
const fullToolsList: AgentTool[] = [
  list_tabs,
  open_tab,
  open_intent,
  enter_city,
  inspect_tab,
  close_tray,
  dock_search,
  dock_pin,
  dock_unpin,
  dock_close,
  apply_theme,
  create_tab,
  update_tab,
  delete_tab,
  get_city_context,
  read_city_file,
  write_city_file,
  open_source,
  search_web,
  fetch_page,
  plan_map,
  build_city,
  list_maps,
  set_map,
  place_city,
  find_capabilities,
  invoke_capability,
  inspect_experience,
  promote_to_plugin,
  inspect_execution,
  list_recent_executions,
  create_plugin,
  connect_cities,
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
  plan_ascii_world,
  generate_image,
];

/**
 * Minimal verb catalog (AGENT_SURFACE=minimal): dock.open/close/pin/unpin/
 * list + plugins.create/edit/install/uninstall/operate.
 */
export const minimalTools: AgentTool[] = [
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
  pluginsCreate,
  pluginsEdit,
  pluginsInstall,
  pluginsUninstall,
  pluginsOperate,
];

export const fullTools: AgentTool[] = fullToolsList;
export const defaultTools: AgentTool[] =
  config.AGENT_SURFACE === "minimal" ? minimalTools : fullToolsList;
