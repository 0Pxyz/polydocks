/**
 * Plugin UI Kit v2 — Level 1 primitives.
 * Every component reads workspace theme tokens only (var(--...)).
 * No hex, no fixed fonts, no fixed colors. A theme switch restyles
 * every plugin without edits. Density via --spacing scale.
 */
import * as React from "react";
import { Button as ShadButton } from "@/components/ui/button";
import { Input as ShadInput } from "@/components/ui/input";
import { Textarea as ShadTextarea } from "@/components/ui/textarea";
import { Progress as ShadProgress } from "@/components/ui/progress";
import { Skeleton as ShadSkeleton } from "@/components/ui/skeleton";
import { Tabs as ShadTabs, TabsList as ShadTabsList, TabsTrigger as ShadTabsTrigger, TabsContent as ShadTabsContent } from "@/components/ui/tabs";
import { Slider as ShadSlider } from "@/components/ui/slider";
import { Tooltip as ShadTooltip, TooltipTrigger as ShadTooltipTrigger, TooltipContent as ShadTooltipContent, TooltipProvider as ShadTooltipProvider } from "@/components/ui/tooltip";

type Gap = 4 | 8 | 12 | 16 | 24 | 32;
const gapStyle = (g: Gap): React.CSSProperties => ({ gap: `var(--spacing-${g}, ${g}px)` });

/* Layout */
export function Stack({ gap = 16, children, className = "" }: { gap?: Gap; children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col ${className}`} style={gapStyle(gap)}>{children}</div>;
}
export function Inline({ gap = 8, children, className = "" }: { gap?: Gap; children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center ${className}`} style={gapStyle(gap)}>{children}</div>;
}
export function Grid({ columns = 2, gap = 16, children, className = "" }: { columns?: 1 | 2 | 3 | 4; children: React.ReactNode; gap?: Gap; className?: string }) {
  return (
    <div className={className} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...gapStyle(gap) }}>
      {children}
    </div>
  );
}
export function Panel({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius)] bg-card p-5 text-card-foreground">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title ? <h2 className="text-[15px] font-semibold text-foreground">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title ? <h3 className="text-[13px] font-semibold text-foreground">{title}</h3> : null}
      {children}
    </section>
  );
}
export function Scroll({ children, maxHeight = 480 }: { children: React.ReactNode; maxHeight?: number }) {
  return <div className="overflow-y-auto" style={{ maxHeight }}>{children}</div>;
}
export function Spacer({ size = 16 }: { size?: Gap }) {
  return <div aria-hidden style={{ height: size }} />;
}

/* Text */
export function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[15px] font-semibold text-foreground">{children}</h1>;
}
export function Text({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-foreground">{children}</p>;
}
export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
export function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[13px] tabular-nums text-foreground">{children}</code>;
}
export function Metric({ value, delta, caption }: { value: string; delta?: string; caption?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-2xl tabular-nums text-foreground">{value}</div>
      {delta ? <span className="text-xs font-medium text-muted-foreground">{delta}</span> : null}
      {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
    </div>
  );
}

/* Actions */
export const KitButton = ShadButton;
export function IconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <ShadButton variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      {children}
    </ShadButton>
  );
}
export function Link({ href, children, onClick }: { href?: string; children: React.ReactNode; onClick?: () => void }) {
  if (href) {
    return (
      <a href={href} onClick={onClick} className="text-[13px] text-primary underline-offset-4 hover:underline">
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className="text-[13px] text-primary underline-offset-4 hover:underline">
      {children}
    </button>
  );
}

/* Inputs */
export function TextField({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const { id: _omit, ...rest } = props as any;
  return (
    <label className="flex flex-col gap-1 text-[13px] text-foreground">
      {label ? <span>{label}</span> : null}
      <ShadInput {...(rest as any)} />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
export function SearchField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <ShadInput type="search" placeholder="Search…" {...(props as any)} />;
}
export function TextAreaField({ label, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] text-foreground">
      {label ? <span>{label}</span> : null}
      <ShadTextarea {...(props as any)} />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
export function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] text-foreground">
      {label ? <span>{label}</span> : null}
      <select
        {...(props as any)}
        className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
      <input type="checkbox" {...(props as any)} className="h-4 w-4 accent-[var(--primary)]" />
      <span>{label}</span>
    </label>
  );
}
export function Switch({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
      <input type="checkbox" role="switch" {...(props as any)} className="h-4 w-4 accent-[var(--primary)]" />
      <span>{label}</span>
    </label>
  );
}
export function SegmentedControl({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <ShadTabs value={value} onValueChange={onChange}>
      <ShadTabsList>
        {options.map((o) => (
          <ShadTabsTrigger key={o.value} value={o.value}>{o.label}</ShadTabsTrigger>
        ))}
      </ShadTabsList>
    </ShadTabs>
  );
}
export const KitTabs = ShadTabs;
export const KitTabsList = ShadTabsList;
export const KitTabsTrigger = ShadTabsTrigger;
export const KitTabsContent = ShadTabsContent;
export const KitSlider = ShadSlider;

/* Data */
export function List({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}
export function ListRow({ title, meta, onOpen, action }: { title: string; meta?: string; onOpen?: () => void; action?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[var(--radius)] bg-card p-3 text-left text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ minHeight: 44 }}
    >
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      {action}
    </button>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius)] bg-card p-4 text-card-foreground">{children}</div>;
}
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials}
    </span>
  );
}
export const ProgressBar = ShadProgress;
export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-label={label} className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />;
}

/* Feedback */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {hint ? <div className="max-w-sm text-xs text-muted-foreground">{hint}</div> : null}
      {action}
    </div>
  );
}
export function InlineMessage({ tone = "info", children }: { tone?: "info" | "success" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "error" ? "text-destructive" : tone === "success" ? "text-foreground" : "text-muted-foreground";
  return <p className={`text-[13px] ${cls}`}>{children}</p>;
}
export const KitSkeleton = ShadSkeleton;
export const KitTooltip = ShadTooltip;
export const KitTooltipTrigger = ShadTooltipTrigger;
export const KitTooltipContent = ShadTooltipContent;
export const KitTooltipProvider = ShadTooltipProvider;
