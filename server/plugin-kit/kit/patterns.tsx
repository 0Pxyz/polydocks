/**
 * Plugin UI Kit v2 — screen patterns.
 * Each pattern is a composite with slots: the agent fills content,
 * never rebuilds structure. All styling via theme tokens.
 */
import * as React from "react";
import { Stack, Inline, Panel, SearchField, SegmentedControl, List, EmptyState, InlineMessage, Metric, Card, TextField, TextAreaField } from "./primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ListWithSearch({ query, onQuery, filter, onFilter, filters, loading, empty, children, notice }: {
  query: string; onQuery: (v: string) => void; filter: string; onFilter: (v: string) => void;
  filters: Array<{ value: string; label: string }>; loading?: boolean; empty?: { title: string; hint?: string; action?: React.ReactNode };
  children: React.ReactNode; notice?: string;
}) {
  return (
    <Stack gap={16}>
      <Inline gap={8}>
        <div className="min-w-40 flex-1"><SearchField value={query} onChange={(e) => onQuery(e.target.value)} /></div>
      </Inline>
      <SegmentedControl value={filter} onChange={onFilter} options={filters} />
      {notice ? <InlineMessage>{notice}</InlineMessage> : null}
      {loading ? <Stack gap={12}><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></Stack> : null}
      {!loading && React.Children.count(children) === 0 && empty ? (
        <EmptyState title={empty.title} hint={empty.hint} action={empty.action} />
      ) : null}
      {!loading ? <List>{children}</List> : null}
    </Stack>
  );
}

export function ListDetail({ list, detail, empty }: { list: React.ReactNode; detail: React.ReactNode; empty?: { title: string; hint?: string } }) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
      <div className="flex flex-col gap-2">{list}</div>
      <div className="rounded-[var(--radius)] bg-card p-4 text-card-foreground">
        {detail || (empty ? <EmptyState title={empty.title} hint={empty.hint} /> : null)}
      </div>
    </div>
  );
}

export function MetricsPanel({ metrics }: { metrics: Array<{ value: string; delta?: string; caption?: string }> }) {
  return (
    <Panel title="Overview">
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m, i) => <Metric key={i} {...m} />)}
      </div>
    </Panel>
  );
}

export function FormPanel({ title, error, onSubmit, submitLabel = "Save", children }: {
  title?: string; error?: string; onSubmit: () => void; submitLabel?: string; children: React.ReactNode;
}) {
  return (
    <Panel title={title} action={<Button size="sm" onClick={onSubmit}>{submitLabel}</Button>}>
      <Stack gap={12}>
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {children}
      </Stack>
    </Panel>
  );
}

export function ReaderFeed({ notice, error, loading, empty, children }: {
  notice?: string; error?: string; loading?: boolean; empty?: { title: string; hint?: string };
  children: React.ReactNode;
}) {
  return (
    <Stack gap={12}>
      {notice ? <InlineMessage>{notice}</InlineMessage> : null}
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {loading ? <Stack gap={12}><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></Stack> : null}
      {!loading && React.Children.count(children) === 0 && empty ? <EmptyState title={empty.title} hint={empty.hint} /> : null}
      {!loading ? <List>{children}</List> : null}
    </Stack>
  );
}

export function NotesEditor({ title, onTitle, body, onBody, onSave, saving }: {
  title: string; onTitle: (v: string) => void; body: string; onBody: (v: string) => void; onSave: () => void; saving?: boolean;
}) {
  return (
    <Stack gap={12}>
      <TextField label="Title" value={title} onChange={(e: any) => onTitle(e.target.value)} />
      <TextAreaField label="Note" rows={10} value={body} onChange={(e: any) => onBody(e.target.value)} />
      <Inline gap={8}>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save note"}</Button>
      </Inline>
    </Stack>
  );
}

export function SettingsForm({ error, onSave, children }: { error?: string; onSave: () => void; children: React.ReactNode }) {
  return <FormPanel title="Settings" error={error} onSubmit={onSave} submitLabel="Save settings">{children}</FormPanel>;
}

export function SingleAction({ title, hint, actionLabel, onAction, result }: {
  title: string; hint?: string; actionLabel: string; onAction: () => void; result?: React.ReactNode;
}) {
  return (
    <Panel title={title} action={<Button size="sm" onClick={onAction}>{actionLabel}</Button>}>
      <Stack gap={12}>
        {hint ? <InlineMessage>{hint}</InlineMessage> : null}
        {result}
      </Stack>
    </Panel>
  );
}

export function StateScreen({ kind, title, hint, action }: {
  kind: "empty" | "error"; title: string; hint?: string; action?: React.ReactNode;
}) {
  return kind === "error"
    ? <Stack gap={12}><InlineMessage tone="error">{title}</InlineMessage>{hint ? <InlineMessage>{hint}</InlineMessage> : null}{action}</Stack>
    : <EmptyState title={title} hint={hint} action={action} />;
}

export const PatternCards = Card;
