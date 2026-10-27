import type { AgentTool } from "./types";
import { list_tabs } from "./list_tabs";
import { open_tab } from "./open_tab";
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

export * from "./types";
export {
  list_tabs,
  open_tab,
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
};

/**
 * The canonical catalog of default Agent tools.
 */
export const defaultTools: AgentTool[] = [
  list_tabs,
  open_tab,
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
];
