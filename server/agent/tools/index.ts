import type { AgentTool } from "./types";
import { list_tabs } from "./list_tabs";
import { open_tab } from "./open_tab";
import { open_intent } from "./open_intent";
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

export * from "./types";
export {
  list_tabs,
  open_tab,
  open_intent,
  inspect_tab,
  close_tray,
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
};

/**
 * The canonical catalog of default Agent tools.
 */
export const defaultTools: AgentTool[] = [
  list_tabs,
  open_tab,
  open_intent,
  inspect_tab,
  close_tray,
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
];
