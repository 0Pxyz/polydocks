/**
 * Plugin UI Kit v2 — Level 2 essentials (demo-driven subset).
 * Token-driven SVG charts, countdown, date field, markdown + code views.
 * No fixed colors, no inline styles (SVG attributes, not style=), no deps.
 */
import * as React from "react";
import { Caption } from "./primitives";

function linePath(values: number[], w: number, h: number, pad: number): { area: string; line: string } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1e-9, hi - lo);
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - lo) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(w - pad).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`;
  return { area, line };
}

export function AreaChart({ values, height = 120, stroke, label }: {
  values: number[]; height?: number; stroke?: string; label?: string;
}) {
  const w = 560;
  const { area, line } = linePath(values.length > 0 ? values : [0], w, height, 8);
  const color = stroke || "var(--primary)";
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label || "Area chart"}>
      <path d={area} fill={color} fillOpacity="0.15" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ values, height = 64, label }: {
  values: number[]; height?: number; label?: string;
}) {
  const w = 560;
  const hi = Math.max(1e-9, ...values);
  const bw = values.length > 0 ? w / values.length : w;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label || "Bar chart"}>
      {values.map((v, i) => {
        const bh = Math.max(2, (v / hi) * (height - 8));
        return (
          <rect
            key={i}
            x={(i * bw + bw * 0.2).toFixed(1)}
            y={(height - 4 - bh).toFixed(1)}
            width={(bw * 0.6).toFixed(1)}
            height={bh.toFixed(1)}
            rx="2"
            fill="var(--primary)"
            fillOpacity={0.45 + 0.55 * (v / hi)}
          />
        );
      })}
    </svg>
  );
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function useCountdown(initialSeconds: number, running: boolean): [number, () => void] {
  const [secs, setSecs] = React.useState(initialSeconds);
  const reset = React.useCallback(() => setSecs(initialSeconds), [initialSeconds]);
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return [secs, reset];
}

export function Countdown({ seconds, caption }: { seconds: number; caption?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-5xl font-semibold tabular-nums text-foreground">{formatClock(seconds)}</span>
      {caption ? <Caption>{caption}</Caption> : null}
    </div>
  );
}

export function DateField({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] text-foreground">
      {label ? <span>{label}</span> : null}
      <input
        type="date"
        {...(props as any)}
        className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-[13px] text-foreground [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(<code key={`${keyPrefix}-${k++}`} className="rounded bg-muted px-1 font-mono text-[12px] text-foreground">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-${k++}`} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    } else {
      const labelMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (labelMatch) {
        parts.push(<a key={`${keyPrefix}-${k++}`} href={labelMatch[2]} className="text-primary underline-offset-4 hover:underline">{labelMatch[1]}</a>);
      } else {
        parts.push(tok);
      }
    }
    last = idx + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = (markdown || "").split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) { buf.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(<CodeBlock key={`md-${k++}`} code={buf.join("\n")} />);
      continue;
    }
    if (/^###\s/.test(line)) {
      blocks.push(<h4 key={`md-${k++}`} className="text-[13px] font-semibold text-foreground">{renderInline(line.replace(/^###\s/, ""), `h${k}`)}</h4>);
    } else if (/^##\s/.test(line)) {
      blocks.push(<h3 key={`md-${k++}`} className="text-[13px] font-semibold text-foreground">{renderInline(line.replace(/^##\s/, ""), `h${k}`)}</h3>);
    } else if (/^#\s/.test(line)) {
      blocks.push(<h2 key={`md-${k++}`} className="text-[15px] font-semibold text-foreground">{renderInline(line.replace(/^#\s/, ""), `h${k}`)}</h2>);
    } else if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s/, "")); i += 1; }
      blocks.push(
        <ul key={`md-${k++}`} className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-foreground">
          {items.map((t, j) => <li key={j}>{renderInline(t, `li${k}-${j}`)}</li>)}
        </ul>
      );
      continue;
    } else if (/^\s*$/.test(line)) {
      blocks.push(<div key={`md-${k++}`} className="h-2" />);
    } else {
      blocks.push(<p key={`md-${k++}`} className="text-[13px] leading-relaxed text-foreground">{renderInline(line, `p${k}`)}</p>);
    }
    i += 1;
  }
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {caption ? <Caption>{caption}</Caption> : null}
      <pre className="overflow-x-auto rounded-[var(--radius)] bg-muted p-3 font-mono text-[12px] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
