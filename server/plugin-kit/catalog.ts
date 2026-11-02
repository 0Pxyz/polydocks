/**
 * Plugin UI Kit v2 catalog — generated from the kit source of truth.
 * KIT_VERSION pins the contract: existing plugins keep working;
 * breaking changes ship a migration note here.
 */
export const KIT_VERSION = "2.0.0";

export interface KitEntry {
  name: string;
  category: "layout" | "text" | "actions" | "inputs" | "data" | "feedback" | "patterns";
  when: string;
  props: string;
  example: string;
  dont: string;
}

const E = (
  name: KitEntry["name"],
  category: KitEntry["category"],
  when: string,
  props: string,
  example: string,
  dont: string,
): KitEntry => ({ name, category, when, props, example, dont });

export const KIT_INDEX: KitEntry[] = [
  E("Stack", "layout", "Vertical stack of blocks with theme spacing", "gap?: 4|8|12|16|24|32", `<Stack gap={16}><Text/></Stack>`, "Do not add custom margins inside; use gap"),
  E("Inline", "layout", "Horizontal row of controls or meta", "gap?", `<Inline gap={8}><Button/><Button/></Inline>`, "Do not wrap loose text without Text"),
  E("Grid", "layout", "Two to four column metric or card grids", "columns?: 1|2|3|4; gap?", `<Grid columns={3}>…</Grid>`, "Do not use for full-page layout"),
  E("Panel", "layout", "Borderless titled section with one optional action", "title?; action?", `<Panel title="Overview" action={<Button/>}>…</Panel>`, "Do not nest panels; one primary action max"),
  E("Section", "layout", "Untitled or small-titled group inside a panel", "title?", `<Section title="Filters">…</Section>`, "Do not add separators between sections"),
  E("Scroll", "layout", "Bounded scroll region for long lists", "maxHeight?", `<Scroll maxHeight={480}>…</Scroll>`, "Do not scroll the whole plugin page"),
  E("Heading", "text", "Screen or panel title", "children", `<Heading>Reading list</Heading>`, "One heading per screen; no italics"),
  E("Text", "text", "Body copy", "children", `<Text>Summary…</Text>`, "No technical ids in visible text"),
  E("Caption", "text", "Muted secondary meta", "children", `<Caption>5 min read</Caption>`, "No repeated read/unread text; use weight"),
  E("Mono", "text", "Numbers, codes, tabular values", "children", `<Mono>1,240</Mono>`, "No mono for prose"),
  E("Metric", "text", "Big number with optional delta and caption", "value; delta?; caption?", `<Metric value="82%" delta="+4pt" caption="This week"/>`, "No raw numbers without context"),
  E("Button", "actions", "The single primary action; secondary/ghost for the rest", "variant?: primary|secondary|ghost|danger; size?: sm|md|icon; loading?", `<Button size="sm">Save</Button>`, "One primary per screen"),
  E("IconButton", "actions", "Icon-only action with accessible label", "label; onClick?", `<IconButton label="Refresh">↻</IconButton>`, "Never without label"),
  E("Link", "actions", "Inline navigation or secondary action", "href?; onClick?", `<Link href="https://…">Docs</Link>`, "No raw <a> styling"),
  E("TextField", "inputs", "Labeled single-line input with error slot", "label?; error? + input props", `<TextField label="Title" error={e}/>`, "No raw <input>"),
  E("SearchField", "inputs", "Filter-as-you-type search", "input props", `<SearchField value={q} onChange={…}/>`, "No separate search button"),
  E("TextAreaField", "inputs", "Multi-line input with error slot", "label?; error?", `<TextAreaField label="Note"/>`, "No raw <textarea>"),
  E("Select", "inputs", "Native select styled by tokens; prefer SegmentedControl under 5 options", "label?; options", `<Select options={[{value,label}]}/>`, "No raw <select> styling"),
  E("Checkbox", "inputs", "Binary option with label", "label", `<Checkbox label="Unread only"/>`, "No checkbox without label"),
  E("Switch", "inputs", "On/off setting", "label", `<Switch label="Sync"/>`, "No switch for multi-choice"),
  E("SegmentedControl", "inputs", "2–4 way filter; backed by Tabs", "value; onChange; options", `<SegmentedControl value onChange options/>`, "No Tabs boilerplate for filters"),
  E("List", "data", "Borderless row stack", "children", `<List><ListRow …/></List>`, "No <ul> with custom bullets"),
  E("ListRow", "data", "Whole-row clickable item, 44px touch target", "title; meta?; onOpen?; action?", `<ListRow title meta onOpen={…}/>`, "No separate open button; row is the button"),
  E("Card", "data", "Subtle surface step for grouped content", "children", `<Card>…</Card>`, "No borders or shadows added"),
  E("Avatar", "data", "Initials avatar derived from name", "name", `<Avatar name="Ada"/>`, "No images without fallback"),
  E("ProgressBar", "data", "Determinate progress", "value", `<ProgressBar value={40}/>`, "No custom bar divs"),
  E("Spinner", "data", "Loading indicator with label", "label?", `<Spinner/>`, "No text-only loading"),
  E("EmptyState", "feedback", "Zero-results with truth and one action", "title; hint?; action?", `<EmptyState title hint action/>`, "No empty screen without action"),
  E("InlineMessage", "feedback", "Human, actionable info/success/error line", "tone?: info|success|error", `<InlineMessage tone="error">…</InlineMessage>`, "No technical ids or stack traces"),
  E("Dialog", "feedback", "Modal confirm or form (shadcn Dialog)", "open; onOpenChange + parts", `<Dialog><DialogContent>…`, "No confirm() or alert()"),
  E("Tooltip", "feedback", "Hover help for icon buttons", "content + trigger", `<Tooltip>…`, "No tooltip on plain text"),
  E("Skeleton", "feedback", "Loading placeholder rows", "className?", `<Skeleton className="h-24 w-full"/>`, "No spinner + skeleton together"),
  E("ListWithSearch", "patterns", "Search + filter + list screen", "query/onQuery/filter/onFilter/filters/loading/empty/notice", `<ListWithSearch …><ListRow …/></ListWithSearch>`, "Do not rebuild search row by hand"),
  E("ListDetail", "patterns", "Master list with side detail", "list; detail; empty?", `<ListDetail list={…} detail={…}/>`, "No two scroll regions on mobile"),
  E("MetricsPanel", "patterns", "KPI overview grid", "metrics[]", `<MetricsPanel metrics={[{value}]}/>`, "Max 4 metrics"),
  E("FormPanel", "patterns", "Validated form with single submit", "title?; error?; onSubmit; submitLabel?", `<FormPanel onSubmit={save}>…</FormPanel>`, "No second submit button"),
  E("ReaderFeed", "patterns", "Article/video feed with notices", "notice?; error?; loading?; empty?", `<ReaderFeed>…</ReaderFeed>`, "No Badge per row; read state by weight"),
  E("NotesEditor", "patterns", "Title + body note composer", "title/onTitle/body/onBody/onSave/saving?", `<NotesEditor …/>`, "No auto-save without feedback"),
  E("SettingsForm", "patterns", "Settings group with one save", "error?; onSave", `<SettingsForm onSave={…}>…`, "No per-row save buttons"),
  E("SingleAction", "patterns", "One tool, one button, one result", "title; actionLabel; onAction; result?", `<SingleAction …/>`, "No multi-step wizard here"),
  E("StateScreen", "patterns", "Full empty or error state", "kind: empty|error", `<StateScreen kind="empty" …/>`, "No raw error dumps"),
];

const BY_NAME = new Map(KIT_INDEX.map((e) => [e.name.toLowerCase(), e]));

export function kitIndex(): Array<Pick<KitEntry, "name" | "category" | "when">> {
  return KIT_INDEX.map(({ name, category, when }) => ({ name, category, when }));
}

export function kitDetails(names: string[]): KitEntry[] {
  const out: KitEntry[] = [];
  for (const n of names) {
    const hit = BY_NAME.get(n.trim().toLowerCase());
    if (hit) out.push(hit);
  }
  return out;
}

export const KIT_IMPORT_ROOT = "@/components/ui/kit";
export const KIT_RULES = [
  "Choose from the catalog; never recreate a component that exists.",
  "One primary action per screen; list rows are wholly clickable (44px).",
  "No tags/badges for status, no italic, no display serif, no separators or bordered boxes.",
  "No tool ids or technical names in visible UI; errors are human and actionable.",
  "Read state by dot or font weight, never by repeated text.",
  "Every color via theme tokens; no hex, no inline style=, no custom CSS where a kit part exists.",
];
