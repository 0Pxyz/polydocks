import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTabState } from "@/lib/tabs/useTabState";

const TAB_ID = "bitcoin-viewer";

interface PricePoint {
  t: number;
  price: number;
}

const BASE_PRICE = 97432.5;

function seedSeries(seed: number, points = 48): PricePoint[] {
  const now = Date.now();
  const out: PricePoint[] = [];
  let price = BASE_PRICE * (0.97 + (seed % 100) / 2500);
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = points - 1; i >= 0; i--) {
    const drift = (rand() - 0.48) * BASE_PRICE * 0.004;
    price = Math.max(1000, price + drift);
    out.push({ t: now - i * 60_000, price });
  }
  return out;
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1000 ? 2 : 0,
  });
}

interface BitcoinViewerProps {
  onDismiss?: () => void;
}

/**
 * Bitcoin live price viewer: first-party dock tool the agent mounts during
 * the cinematic onboarding tour (replaces the old flashcards demo).
 * Simulated live feed with sparkline, timeframe + currency controls, and
 * durable state via useTabState so hibernation restores without loss.
 * Renders unconditionally; the host hides inactive tabs with CSS.
 */
export function BitcoinViewer({ onDismiss }: BitcoinViewerProps) {
  const [currency, setCurrency] = useTabState<string>(TAB_ID, "currency", "USD");
  const [timeframe, setTimeframe] = useTabState<string>(TAB_ID, "timeframe", "1H");
  const [pinned, setPinned] = useTabState<boolean>(TAB_ID, "pinned", false);
  const [series, setSeries] = useState<PricePoint[]>(() => seedSeries(42));
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1];
        const drift = (Math.random() - 0.48) * BASE_PRICE * 0.0012;
        const next: PricePoint = {
          t: Date.now(),
          price: Math.max(1000, last.price + drift),
        };
        return [...prev.slice(-59), next];
      });
    }, 1500);
    return () => clearInterval(id);
  }, [live]);

  const stats = useMemo(() => {
    if (series.length === 0) return { last: BASE_PRICE, change: 0, pct: 0, high: BASE_PRICE, low: BASE_PRICE };
    const last = series[series.length - 1].price;
    const first = series[0].price;
    const change = last - first;
    const pct = first === 0 ? 0 : (change / first) * 100;
    const high = Math.max(...series.map((p) => p.price));
    const low = Math.min(...series.map((p) => p.price));
    return { last, change, pct, high, low };
  }, [series]);

  const rate = currency === "EUR" ? 0.92 : currency === "GBP" ? 0.79 : 1;
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const display = (usd: number) =>
    `${symbol}${(usd * rate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const up = stats.change >= 0;
  const width = 560;
  const height = 160;
  const min = Math.min(...series.map((p) => p.price));
  const max = Math.max(...series.map((p) => p.price));
  const span = Math.max(1, max - min);
  const path = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * width;
      const y = height - 12 - ((p.price - min) / span) * (height - 32);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="flex h-full w-full max-w-2xl flex-col justify-between p-8 font-sans text-foreground select-none">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-400 animate-pulse" aria-hidden="true" />
              <h2 className="text-base font-semibold">Bitcoin · Live price</h2>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                {live ? "LIVE" : "PAUSED"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{display(stats.last)}</span>
              <span className={`text-sm tabular-nums ${up ? "text-emerald-400" : "text-rose-400"}`}>
                {up ? "▲" : "▼"} {display(Math.abs(stats.change))} ({up ? "+" : ""}{stats.pct.toFixed(2)}%)
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {timeframe} · H {display(stats.high)} · L {display(stats.low)} · Simulated feed for demo
            </p>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Close
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/30 p-3" aria-label="Bitcoin price chart">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img">
            <defs>
              <linearGradient id="btc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f7931a" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2={width}
                y1={height * f}
                y2={height * f}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            ))}
            <path d={`${path} L${width},${height} L0,${height} Z`} fill="url(#btc-fill)" />
            <path d={path} fill="none" stroke="#f7931a" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Timeframe</span>
          {(["15M", "1H", "4H", "1D"] as const).map((t) => (
            <Button
              key={t}
              variant={timeframe === t ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTimeframe(t);
                setSeries(seedSeries(t.length * 17 + t.charCodeAt(0)));
              }}
            >
              {t}
            </Button>
          ))}
          <span className="ml-2 text-muted-foreground">Currency</span>
          {(["USD", "EUR", "GBP"] as const).map((c) => (
            <Button key={c} variant={currency === c ? "default" : "outline"} size="sm" onClick={() => setCurrency(c)}>
              {c}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLive((v) => !v)}>
            {live ? "Pause feed" : "Resume feed"}
          </Button>
          <Button
            variant={pinned ? "default" : "outline"}
            size="sm"
            onClick={() => setPinned((v) => !v)}
          >
            {pinned ? "Pinned to dock" : "Pin to dock"}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Agent-mounted tool · state survives hibernation · {formatUsd(stats.last)} reference
        </div>
      </div>
    </div>
  );
}
