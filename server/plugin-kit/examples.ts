/**
 * Plugin UI Kit v2 — canonical reference examples (J).
 * timer, feed, form, metrics, notes. Every example composes kit parts
 * only, reads workspace theme tokens, and passes the kit gate +
 * render validation. The agent studies these; QA renders them.
 */

export interface KitExample {
  name: string;
  kind: "timer" | "list" | "form" | "panel" | "notes";
  code: string;
}

const TIMER = `import { Stack, Heading, Caption, Mono, Inline } from "@/components/ui/kit";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
function App() {
  const [secs, setSecs] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <Stack gap={16}>
      <Heading>Focus timer</Heading>
      <Mono>{mm}:{ss}</Mono>
      <Caption>{running ? "Stay with it." : "Paused."}</Caption>
      <Inline gap={8}>
        <Button size="sm" onClick={() => setRunning(!running)}>{running ? "Pause" : "Start"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setRunning(false); setSecs(25 * 60); }}>Reset</Button>
      </Inline>
    </Stack>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

const FEED = `import { ReaderFeed, ListRow } from "@/components/ui/kit";
import { useState } from "react";
import { createRoot } from "react-dom/client";
const ITEMS = [
  { title: "Go-to-market strategy framework", meta: "HBS · article", url: "https://example.com/gtm" },
  { title: "Growth for startups", meta: "Video · 12 min", url: "https://example.com/growth" },
];
function App() {
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const open = async (url: string) => {
    setRead((r) => ({ ...r, [url]: true }));
    try { await (window as any).polydocks.openContent(url); }
    catch { setNotice("Could not open this link right now — try again."); }
  };
  return (
    <ReaderFeed notice={notice || undefined} empty={{ title: "Nothing here yet", hint: "Fresh items land on top." }}>
      {ITEMS.map((x) => (
        <ListRow key={x.url} title={x.title} meta={read[x.url] ? x.meta : x.meta + " · unread"} onOpen={() => open(x.url)} />
      ))}
    </ReaderFeed>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

const FORM = `import { FormPanel, TextField, TextAreaField, Select } from "@/components/ui/kit";
import { useState } from "react";
import { createRoot } from "react-dom/client";
function App() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("article");
  const [error, setError] = useState<string | undefined>(undefined);
  const save = async () => {
    if (!title.trim()) { setError("Give this item a title first."); return; }
    setError(undefined);
    await (window as any).polydocks.storage.set("capture:last", { title, body, kind });
  };
  return (
    <FormPanel title="Capture" error={error} onSubmit={save} submitLabel="Save">
      <TextField label="Title" value={title} onChange={(e: any) => setTitle(e.target.value)} />
      <TextAreaField label="Details" rows={4} value={body} onChange={(e: any) => setBody(e.target.value)} />
      <Select label="Kind" value={kind} onChange={(e: any) => setKind(e.target.value)} options={[{ value: "article", label: "Article" }, { value: "video", label: "Video" }]} />
    </FormPanel>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

const METRICS = `import { MetricsPanel, ListWithSearch, ListRow, AreaChart } from "@/components/ui/kit";
import { useState } from "react";
import { createRoot } from "react-dom/client";
const ROWS = [
  { title: "Bitcoin", meta: "BTC · store of value" },
  { title: "Design tokens", meta: "Docs · 5 min read" },
];
function App() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = ROWS.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-4">
      <MetricsPanel metrics={[{ value: "1,240", delta: "+4%", caption: "Reads" }, { value: "82", caption: "Saved" }, { value: "12", caption: "Feeds" }]} />
      <AreaChart values={[4, 7, 5, 9, 8, 12, 11]} height={100} label="Reads this week" />
      <ListWithSearch query={q} onQuery={setQ} filter={filter} onFilter={setFilter}
        filters={[{ value: "all", label: "All" }]}
        empty={{ title: "No matches", hint: "Try a shorter search." }}>
        {rows.map((r) => <ListRow key={r.title} title={r.title} meta={r.meta} onOpen={() => {}} />)}
      </ListWithSearch>
    </div>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

const NOTES = `import { NotesEditor, InlineMessage } from "@/components/ui/kit";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
function App() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { (window as any).polydocks.storage.get("notes:draft").then((v: any) => { if (v) { setTitle(v.title || ""); setBody(v.body || ""); } }).catch(() => {}); }, []);
  const save = async () => {
    setSaving(true);
    await (window as any).polydocks.storage.set("notes:draft", { title, body });
    setSaving(false);
    setSaved(true);
  };
  return (
    <div className="flex flex-col gap-2">
      {saved ? <InlineMessage tone="success">Saved — visible on every device.</InlineMessage> : null}
      <NotesEditor title={title} onTitle={setTitle} body={body} onBody={setBody} onSave={save} saving={saving} />
    </div>
  );
}
createRoot(document.getElementById("app")).render(<App />);`;

export const KIT_EXAMPLES: KitExample[] = [
  { name: "timer", kind: "timer", code: TIMER },
  { name: "feed", kind: "list", code: FEED },
  { name: "capture-form", kind: "form", code: FORM },
  { name: "metrics", kind: "panel", code: METRICS },
  { name: "notes", kind: "notes", code: NOTES },
];
