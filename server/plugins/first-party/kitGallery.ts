import { pluginRegistry } from "../registry";
import type { PluginManifest } from "../manifest";

/**
 * Kit Gallery: internal QA surface showing every Level 1 component and
 * pattern in the active workspace theme (light/dark via tokens).
 * Registered on boot; not published to the store.
 */
const GALLERY_CODE = `import { Stack, Heading, Text, Caption, Mono, Metric, Inline, Grid, Panel, Section, TextField, SearchField, TextAreaField, Select, Checkbox, Switch, SegmentedControl, List, ListRow, Card, Avatar, Spinner, EmptyState, InlineMessage, ListWithSearch, MetricsPanel, FormPanel, ReaderFeed, SettingsForm, SingleAction, StateScreen, AreaChart, Bars, Countdown, DateField, MarkdownView, CodeBlock } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { createRoot } from "react-dom/client";
function App() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("Ada Lovelace");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="flex min-h-full flex-col gap-4 p-5">
      <Heading>Kit Gallery v2 — theme-driven</Heading>
      <Caption>Every part below reads workspace tokens. Switch the theme: all panels follow.</Caption>
      <MetricsPanel metrics={[{ value: "1,240", delta: "+4%", caption: "Reads" }, { value: "82", caption: "Saved" }, { value: "12", caption: "Feeds" }]} />
      <Panel title="Actions" action={<Button size="sm">Primary</Button>}>
        <Inline gap={8}><Button size="sm" variant="secondary">Secondary</Button><Button size="sm" variant="ghost">Quiet</Button></Inline>
      </Panel>
      <Panel title="Inputs">
        <Stack gap={12}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <SearchField value={q} onChange={(e) => setQ(e.target.value)} />
          <TextAreaField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Select label="Source" options={[{ value: "a", label: "Articles" }, { value: "v", label: "Videos" }]} />
          <Inline gap={8}><Checkbox label="Unread only" /><Switch label="Sync" /></Inline>
          <SegmentedControl value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "a", label: "Articles" }, { value: "v", label: "Videos" }]} />
        </Stack>
      </Panel>
      <Panel title="Data">
        <Stack gap={12}>
          <Grid columns={3}><Metric value="98%" caption="Uptime" /><Metric value="31" caption="Plugins" /><Mono>v2.0.0</Mono></Grid>
          <List>
            <ListRow title="Go-to-market strategy" meta="HBS · unread" onOpen={() => {}} />
            <ListRow title="Design tokens" meta="Docs · read" onOpen={() => {}} />
          </List>
          <Inline gap={8}><Avatar name="Ada Lovelace" /><Text>Inline text with mono <Mono>42</Mono></Text><Spinner /></Inline>
          <Skeleton className="h-12 w-full" />
        </Stack>
      </Panel>
      <Panel title="Feedback">
        <Stack gap={12}>
          <EmptyState title="Nothing here yet" hint="Add your first feed to populate this view." action={<Button size="sm">Add feed</Button>} />
          <InlineMessage>Saved — visible on every device.</InlineMessage>
          <InlineMessage tone="error">Could not refresh — showing the saved list.</InlineMessage>
        </Stack>
      </Panel>
      <Panel title="Level 2">
        <Stack gap={12}>
          <AreaChart values={[3, 5, 4, 7, 6, 9, 8]} height={100} label="Demo area" />
          <Bars values={[2, 5, 3, 8, 6]} height={48} />
          <Countdown seconds={754} caption="Demo countdown" />
          <DateField label="Due" />
          <MarkdownView markdown={"# Demo\\nSome **bold** and \`code\`."} />
          <CodeBlock code="createRoot(document.getElementById('app')).render(<App />);" caption="Mount" />
        </Stack>
      </Panel>
      <FormPanel title="Settings demo" error={err} onSubmit={() => setErr(name ? "" : "Give the workspace a name first.")} submitLabel="Save settings">
        <Section title="Workspace"><Text>One primary action per screen; rows stay wholly clickable.</Text></Section>
      </FormPanel>
      <SingleAction title="One-click tool" hint="Runs once and shows the result inline." actionLabel="Run" onAction={() => {}} result={<Card><Text>Result appears here.</Text></Card>} />
      <StateScreen kind="empty" title="All caught up" hint="No further patterns to show." />
      <ReaderFeed notice="Gallery renders the same patterns agents compose." empty={{ title: "No items", hint: "Feed is intentionally empty here." }}>{null}</ReaderFeed>
      <SettingsForm onSave={() => {}}><Text>Settings slot.</Text></SettingsForm>
    </div>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

export function registerKitGalleryPlugin(): void {
  // QA fixture, not user content (#310): never install in production.
  // Dev and test keep it for kit render validation.
  const nodeEnv = typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
  if (nodeEnv === "production") return;
  const manifest: PluginManifest = {
    apiVersion: 1,
    id: "kit-gallery",
    name: "Kit Gallery",
    version: "2.0.0",
    description: "Internal QA gallery for Plugin UI Kit v2 (theme-driven)",
    icon: "LayoutGrid",
    trust: "core",
    capabilities: [],
  };
  try {
    pluginRegistry.install(manifest);
  } catch {
    // Registry may already hold it; gallery is best-effort QA.
  }
}

export const KIT_GALLERY_CODE = GALLERY_CODE;
