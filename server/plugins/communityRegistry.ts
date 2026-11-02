import { db } from "../workspace/db";
import { PluginRegistry } from "./registry";
import type { PluginManifest } from "./manifest";
import { readFeature, writeFeature } from "../workspace/features";
import { addPluginToWorkspace, ensureDefaultWorkspace } from "../workspace/workspaces";

export interface RegistryPluginItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  author: string;
  tags: string[];
  manifest: PluginManifest;
  code: string;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export function ensureRegistrySchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT 'Cards',
      version TEXT NOT NULL,
      author TEXT DEFAULT 'Community',
      tags_json TEXT,
      manifest_json TEXT NOT NULL,
      code TEXT NOT NULL,
      downloads INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * Lists all plugins in the community registry.
 */
export function listRegistryPlugins(filter?: {
  search?: string;
  tag?: string;
}): RegistryPluginItem[] {
  ensureRegistrySchema();
  seedDefaultCommunityPlugins();

  let query = "SELECT * FROM registry_plugins";
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter?.search) {
    conditions.push("(name LIKE ? OR description LIKE ? OR id LIKE ?)");
    const pattern = `%${filter.search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY downloads DESC, name ASC";

  const rows = db.query<any, string[]>(query).all(...params);

  return rows
    .map((r) => {
      let tags: string[] = [];
      let manifest: PluginManifest | null = null;
      try {
        if (r.tags_json) tags = JSON.parse(r.tags_json);
        if (r.manifest_json) manifest = JSON.parse(r.manifest_json);
      } catch {
        // ignore
      }
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon || "Cards",
        version: r.version,
        author: r.author || "Community",
        tags,
        manifest: manifest || ({} as PluginManifest),
        code: r.code,
        downloads: r.downloads || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    })
    .filter((item) => {
      if (!filter?.tag) return true;
      return item.tags.some((t) => t.toLowerCase() === filter.tag?.toLowerCase());
    });
}

/**
 * Gets a registry plugin by ID.
 */
export function getRegistryPlugin(id: string): RegistryPluginItem | null {
  ensureRegistrySchema();
  const r = db.query<any, [string]>("SELECT * FROM registry_plugins WHERE id = ?").get(id);
  if (!r) return null;

  let tags: string[] = [];
  let manifest: PluginManifest = {} as PluginManifest;
  try {
    if (r.tags_json) tags = JSON.parse(r.tags_json);
    if (r.manifest_json) manifest = JSON.parse(r.manifest_json);
  } catch {
    // ignore
  }

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon || "Cards",
    version: r.version,
    author: r.author || "Community",
    tags,
    manifest,
    code: r.code,
    downloads: r.downloads || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Publishes an existing workspace plugin to the community registry.
 */
export async function publishToRegistry(input: {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
}): Promise<{ success: boolean; item?: RegistryPluginItem; error?: string }> {
  ensureRegistrySchema();
  const workspaceId = input.workspaceId || "default";
  const pluginId = input.pluginId.toLowerCase().trim();

  const registry = PluginRegistry.getInstance();
  const existingPlugin = registry.get(pluginId);
  const existingFeature = await readFeature(workspaceId, pluginId);

  if (!existingPlugin && !existingFeature) {
    return {
      success: false,
      error: `Plugin "${pluginId}" not found in workspace "${workspaceId}"`,
    };
  }

  const name = existingPlugin?.name || existingFeature?.manifest.title || pluginId;
  const description =
    existingPlugin?.manifest.description ||
    existingFeature?.manifest.description ||
    "Custom synthesized plugin";
  const icon =
    existingPlugin?.manifest.icon || (existingFeature?.manifest.icon as string) || "Cards";
  const version = existingPlugin?.version || "1.0.0";
  const author = input.author?.trim() || "PolyDocks Creator";
  const tags = input.tags || ["productivity", "micro-app"];
  const code = existingFeature?.code || "";

  const manifest: PluginManifest = existingPlugin?.manifest || {
    apiVersion: 1,
    id: pluginId,
    name,
    version,
    description,
    icon,
    trust: "generated",
    capabilities: [],
    surfaces: [
      {
        id: pluginId,
        title: name,
        icon,
        variant: "immersive",
        entry: `features/${pluginId}`,
      },
    ],
    permissions: [],
  };

  const now = new Date().toISOString();

  db.query(`
    INSERT OR REPLACE INTO registry_plugins (id, name, description, icon, version, author, tags_json, manifest_json, code, downloads, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT downloads FROM registry_plugins WHERE id = ?), 0), ?, ?)
  `).run(
    pluginId,
    name,
    description,
    icon,
    version,
    author,
    JSON.stringify(tags),
    JSON.stringify(manifest),
    code,
    pluginId,
    now,
    now
  );

  return {
    success: true,
    item: {
      id: pluginId,
      name,
      description,
      icon,
      version,
      author,
      tags,
      manifest,
      code,
      downloads: 0,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Installs a plugin from the community registry into a target workspace.
 */
export async function installFromRegistry(
  registryPluginId: string,
  targetWorkspaceId: string
): Promise<{ success: boolean; error?: string; plugin?: PluginManifest }> {
  ensureDefaultWorkspace();
  const item = getRegistryPlugin(registryPluginId);
  if (!item) {
    return { success: false, error: `Registry plugin "${registryPluginId}" not found.` };
  }

  // 1. Write the code into the target workspace
  const featureManifest = {
    id: item.id,
    title: item.name,
    icon: item.icon,
    scope: "workspace",
    workspaceId: targetWorkspaceId,
    capabilities: item.manifest.capabilities?.map((c) => c.id) || [],
    createdAt: new Date().toISOString(),
  };

  await writeFeature(targetWorkspaceId, item.id, {
    manifest: featureManifest,
    code: item.code,
  });

  // 2. Install into local PluginRegistry
  const registry = PluginRegistry.getInstance();
  const installRes = registry.install(item.manifest);
  if (!installRes.success) {
    return { success: false, error: installRes.error || "Failed to install manifest" };
  }

  // 3. Mount in workspace
  addPluginToWorkspace(targetWorkspaceId, item.id);

  // 4. Increment download count
  db.query("UPDATE registry_plugins SET downloads = downloads + 1 WHERE id = ?").run(item.id);

  return { success: true, plugin: item.manifest };
}

/**
 * Seeds default canonical community plugins if none exist in the database.
 */
export function seedDefaultCommunityPlugins(): void {
  ensureRegistrySchema();
  const count = db.query<any, []>("SELECT COUNT(*) as count FROM registry_plugins").get()?.count || 0;

  const now = new Date().toISOString();

  // 0. Bitcoin (live exchange data, no mocks)
  const bitcoinManifest: PluginManifest = {
    apiVersion: 1,
    id: "bitcoin",
    name: "Bitcoin",
    version: "1.0.0",
    description: "Live Bitcoin price with real exchange data: area chart, timeframes, USD/EUR/GBP.",
    icon: "bitcoin",
    trust: "generated",
    capabilities: [],
    surfaces: [
      {
        id: "bitcoin",
        title: "Bitcoin",
        icon: "bitcoin",
        variant: "immersive",
        entry: "features/bitcoin",
      },
    ],
    permissions: [],
  };

  const bitcoinCode = `
    import { Badge } from "@/components/ui/badge";
    import { Button } from "@/components/ui/button";
    import { Skeleton } from "@/components/ui/skeleton";
    import { useEffect, useRef, useState } from "react";
    import { createRoot } from "react-dom/client";

    const BTC_ORANGE = "#f7931a";
    const FIATS = ["USD", "EUR", "GBP"];
    const FRAMES = ["15M", "1H", "4H", "1D"];
    const IV = { "15M": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
    const GRAN = { "15M": 900, "1H": 3600, "4H": 14400, "1D": 86400 };
    const SYM = { USD: "BTCUSDT", EUR: "BTCEUR", GBP: "BTCGBP" };
    const SIGN = { USD: "$", EUR: "€", GBP: "£" };

    function bridge() {
      return window.polymax || {};
    }
    async function storeGet(key) {
      try {
        return await bridge().storage.get(key);
      } catch (err) {
        return undefined;
      }
    }
    function storeSet(key, value) {
      try {
        bridge().storage.set(key, value);
      } catch (err) {}
    }
    async function getJSON(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }
    async function loadFeed(fiat, frame) {
      const sym = SYM[fiat];
      const iv = IV[frame];
      try {
        const raw = await getJSON("https://api.binance.com/api/v3/klines?symbol=" + sym + "&interval=" + iv + "&limit=120");
        const candles = raw.map(function (k) {
          return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] };
        });
        return {
          candles: candles,
          source: "Binance",
          pair: "BTC/" + fiat,
          wsUrl: "wss://stream.binance.com:9443/ws/" + sym.toLowerCase() + "@kline_" + iv,
        };
      } catch (firstErr) {
        if (fiat === "USD") {
          try {
            const rawUs = await getJSON("https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=" + iv + "&limit=120");
            const candlesUs = rawUs.map(function (k) {
              return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] };
            });
            return {
              candles: candlesUs,
              source: "Binance.US",
              pair: "BTC/USD",
              wsUrl: "wss://stream.binance.us:9443/ws/btcusdt@kline_" + iv,
            };
          } catch (secondErr) {}
        }
        const rawCb = await getJSON("https://api.exchange.coinbase.com/products/BTC-" + fiat + "/candles?granularity=" + GRAN[frame]);
        const candlesCb = rawCb
          .map(function (c) {
            return { t: c[0] * 1000, l: +c[1], h: +c[2], o: +c[3], c: +c[4] };
          })
          .reverse();
        if (candlesCb.length === 0) throw new Error("Coinbase returned no candles");
        return { candles: candlesCb, source: "Coinbase", pair: "BTC/" + fiat, wsUrl: null };
      }
    }

    function connLabel(conn) {
      if (conn === "live") return "LIVE";
      if (conn === "polling") return "POLLING";
      if (conn === "paused") return "PAUSED";
      if (conn === "retry") return "RETRYING";
      if (conn === "error") return "OFFLINE";
      return "LOADING";
    }

    function App() {
      const [fiat, setFiat] = useState("USD");
      const [frame, setFrame] = useState("1H");
      const [candles, setCandles] = useState([]);
      const [source, setSource] = useState("");
      const [pair, setPair] = useState("BTC/USD");
      const [conn, setConn] = useState("loading");
      const [error, setError] = useState("");
      const [paused, setPaused] = useState(false);
      const [nonce, setNonce] = useState(0);
      const wsRef = useRef(null);
      const retryRef = useRef(0);
      const timersRef = useRef([]);

      useEffect(function () {
        storeGet("bitcoin_fiat").then(function (v) {
          if (typeof v === "string" && SYM[v]) setFiat(v);
        });
        storeGet("bitcoin_frame").then(function (v) {
          if (typeof v === "string" && IV[v]) setFrame(v);
        });
      }, []);

      useEffect(function () {
        storeSet("bitcoin_fiat", fiat);
        storeSet("bitcoin_frame", frame);
      }, [fiat, frame]);

      useEffect(function () {
        function clearAll() {
          try {
            if (wsRef.current) wsRef.current.close();
          } catch (err) {}
          wsRef.current = null;
          const timers = timersRef.current;
          timersRef.current = [];
          for (const t of timers) {
            clearTimeout(t);
            clearInterval(t);
          }
        }
        function schedulePoll() {
          setConn("polling");
          const id = window.setInterval(function () {
            loadFeed(fiat, frame)
              .then(function (feed) {
                setCandles(feed.candles);
                setSource(feed.source);
                setPair(feed.pair);
              })
              .catch(function () {});
          }, 15000);
          timersRef.current.push(id);
        }
        function connectWs(url) {
          let ws = null;
          try {
            ws = new WebSocket(url);
          } catch (err) {
            schedulePoll();
            return;
          }
          wsRef.current = ws;
          ws.onopen = function () {
            setConn("live");
          };
          ws.onmessage = function (ev) {
            try {
              const k = JSON.parse(ev.data).k;
              if (!k) return;
              const price = +k.c;
              const t = k.t;
              setCandles(function (prev) {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                if (last.t === t) {
                  const next = prev.slice();
                  next[next.length - 1] = {
                    t: t,
                    o: last.o,
                    h: Math.max(last.h, price),
                    l: Math.min(last.l, price),
                    c: price,
                  };
                  return next;
                }
                return prev.concat([{ t: t, o: price, h: price, l: price, c: price }]).slice(-240);
              });
            } catch (err) {}
          };
          const drop = function () {
            if (retryRef.current >= 4) {
              schedulePoll();
              return;
            }
            retryRef.current += 1;
            setConn("retry");
            const wait = Math.min(30000, 1000 * Math.pow(2, retryRef.current));
            const id = window.setTimeout(function () {
              connectWs(url);
            }, wait);
            timersRef.current.push(id);
          };
          ws.onerror = drop;
          ws.onclose = drop;
        }
        if (paused) {
          clearAll();
          setConn("paused");
          return clearAll;
        }
        setConn("loading");
        setError("");
        retryRef.current = 0;
        let cancelled = false;
        loadFeed(fiat, frame)
          .then(function (feed) {
            if (cancelled) return;
            setCandles(feed.candles);
            setSource(feed.source);
            setPair(feed.pair);
            if (feed.wsUrl) connectWs(feed.wsUrl);
            else schedulePoll();
          })
          .catch(function (err) {
            if (cancelled) return;
            setConn("error");
            setError(err && err.message ? err.message : "Price feed unreachable. Check connection and retry.");
          });
        return function () {
          cancelled = true;
          clearAll();
        };
      }, [fiat, frame, paused, nonce]);

      const last = candles.length > 0 ? candles[candles.length - 1].c : 0;
      const first = candles.length > 0 ? candles[0].c : 0;
      const change = last - first;
      const pct = first === 0 ? 0 : (change / first) * 100;
      let high = last;
      let low = last;
      for (const c of candles) {
        if (c.h > high) high = c.h;
        if (c.l < low) low = c.l;
      }
      const up = change >= 0;
      const sign = SIGN[fiat] || "$";
      const fmt = function (n) {
        return sign + Math.round(n).toLocaleString("en-US");
      };
      const W = 560;
      const H = 160;
      let lo = last;
      let hi = last;
      for (const c of candles) {
        if (c.l < lo) lo = c.l;
        if (c.h > hi) hi = c.h;
      }
      const span = Math.max(1, hi - lo);
      let path = "";
      for (let i = 0; i < candles.length; i++) {
        const x = (i / Math.max(1, candles.length - 1)) * W;
        const y = H - 12 - ((candles[i].c - lo) / span) * (H - 32);
        path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
      }

      return (
        <div className="flex h-full w-full max-w-2xl flex-col justify-between p-8 font-sans text-foreground select-none">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={"inline-block h-2 w-2 rounded-full " + (conn === "live" ? "bg-emerald-400 animate-pulse" : conn === "error" ? "bg-rose-400" : "bg-amber-400 animate-pulse")}
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold">Bitcoin · Live price</h2>
                  <Badge variant="outline">{connLabel(conn)}</Badge>
                </div>
                {candles.length === 0 && conn !== "error" ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ) : (
                  <div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold tabular-nums">{fmt(last)}</span>
                      <span className={"text-sm tabular-nums " + (up ? "text-emerald-400" : "text-rose-400")}>
                        {up ? "▲" : "▼"} {fmt(Math.abs(change))} ({up ? "+" : ""}{pct.toFixed(2)}%)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {frame} · H {fmt(high)} · L {fmt(low)} · {source} {pair}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {conn === "error" ? (
              <div className="rounded-lg bg-card p-4 text-sm" role="alert">
                <p className="font-medium text-rose-400">Feed offline</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                <Button size="sm" className="mt-3" onClick={function () { setNonce(function (n) { return n + 1; }); }}>
                  Retry
                </Button>
              </div>
            ) : (
              <div className="rounded-lg bg-card p-3" aria-label="Bitcoin price chart">
                <svg viewBox={"0 0 " + W + " " + H} className="h-40 w-full" role="img">
                  {[0.25, 0.5, 0.75].map(function (f) {
                    return (
                      <line
                        key={f}
                        x1="0"
                        x2={W}
                        y1={H * f}
                        y2={H * f}
                        stroke="currentColor"
                        className="text-muted-foreground"
                        strokeOpacity="0.25"
                        strokeWidth="1"
                      />
                    );
                  })}
                  <path d={path + "L" + W + "," + H + " L0," + H + " Z"} fill={BTC_ORANGE} fillOpacity="0.15" />
                  <path d={path} fill="none" stroke={BTC_ORANGE} strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Timeframe</span>
              {FRAMES.map(function (t) {
                return (
                  <Button key={t} variant={frame === t ? "default" : "outline"} size="sm" onClick={function () { setFrame(t); }}>
                    {t}
                  </Button>
                );
              })}
              <span className="ml-2 text-muted-foreground">Currency</span>
              {FIATS.map(function (c) {
                return (
                  <Button key={c} variant={fiat === c ? "default" : "outline"} size="sm" onClick={function () { setFiat(c); }}>
                    {c}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={function () { setPaused(function (v) { return !v; }); }}>
                {paused ? "Resume feed" : "Pause feed"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {"Live via " + (source || "exchange") + " · " + pair}
            </div>
          </div>
        </div>
      );
    }

    createRoot(document.getElementById("app")).render(<App />);
  `;

  const hasBitcoin =
    count > 0
      ? (db.query<any, ["string"]>("SELECT id FROM registry_plugins WHERE id = ?").get("bitcoin") as any)
      : null;
  if (!hasBitcoin) {
    db.query(
      "INSERT INTO registry_plugins (id, name, description, icon, version, author, tags_json, manifest_json, code, downloads, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)"
    ).run(
      "bitcoin",
      "Bitcoin",
      "Live Bitcoin price with real exchange data: area chart, timeframes, USD/EUR/GBP.",
      "bitcoin",
      "1.0.0",
      "PolyDocks Team",
      JSON.stringify(["finance", "crypto", "tracker"]),
      JSON.stringify(bitcoinManifest),
      bitcoinCode,
      now,
      now
    );
  }

  // 1. Pomodoro Focus
  const pomodoroCode = `
    const app = document.getElementById('app');
    let timeLeft = 25 * 60;
    let timerId = null;
    let isRunning = false;
    let mode = 'work';
    let sessions = [];

    window.polymax.storage.get('pomodoro_sessions').then(saved => {
      if (Array.isArray(saved)) {
        sessions = saved;
        renderHistory();
      }
    });

    app.innerHTML = \`
      <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px;">
        <div style="display: flex; gap: 8px;">
          <button id="m-work" class="primary" style="padding: 6px 16px; border-radius: 20px;">Focus 25m</button>
          <button id="m-break" style="padding: 6px 16px; border-radius: 20px;">Break 5m</button>
        </div>
        <div id="disp" style="font-family: var(--font-mono); font-size: 64px; font-weight: 700; color: var(--accent); letter-spacing: -2px;">
          25:00
        </div>
        <div style="display: flex; gap: 12px;">
          <button id="toggle" class="primary" style="padding: 10px 24px; font-size: 15px;">Start session</button>
          <button id="reset" style="padding: 10px 18px;">Reset</button>
        </div>
        <div style="width: 100%; margin-top: 8px; padding-top: 8px;">
          <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">Completed sessions: <span id="cnt">0</span></div>
          <div id="hist" style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;"></div>
        </div>
      </div>
    \`;

    function updateDisp() {
      const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const s = (timeLeft % 60).toString().padStart(2, '0');
      document.getElementById('disp').innerText = \`\${m}:\${s}\`;
    }

    function setMode(next) {
      if (isRunning) return;
      mode = next;
      timeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
      updateDisp();
      document.getElementById('m-work').className = mode === 'work' ? 'primary' : '';
      document.getElementById('m-break').className = mode === 'break' ? 'primary' : '';
      document.getElementById('toggle').innerText = 'Start session';
    }

    function renderHistory() {
      const list = document.getElementById('hist');
      const count = document.getElementById('cnt');
      if (!list || !count) return;
      count.innerText = sessions.length;
      list.innerHTML = sessions.slice(-5).reverse().map(s => \`
        <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 8px 4px;">
          <span>\${s.mode === 'work' ? 'Focus' : 'Break'}</span>
          <span style="color: var(--muted); font-family: var(--font-mono);">\${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      \`).join('');
    }

    document.getElementById('m-work').addEventListener('click', () => setMode('work'));
    document.getElementById('m-break').addEventListener('click', () => setMode('break'));
    document.getElementById('toggle').addEventListener('click', () => {
      isRunning = !isRunning;
      document.getElementById('toggle').innerText = isRunning ? 'Pause' : 'Resume';
      if (isRunning) {
        timerId = setInterval(() => {
          if (timeLeft > 0) {
            timeLeft--;
            updateDisp();
          } else {
            clearInterval(timerId);
            isRunning = false;
            sessions.push({ mode, timestamp: Date.now() });
            window.polymax.storage.set('pomodoro_sessions', sessions);
            renderHistory();
          }
        }, 1000);
      } else {
        clearInterval(timerId);
      }
    });

    document.getElementById('reset').addEventListener('click', () => {
      clearInterval(timerId);
      isRunning = false;
      timeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
      updateDisp();
      document.getElementById('toggle').innerText = 'Start Session';
    });
  `;

  const pomodoroManifest: PluginManifest = {
    apiVersion: 1,
    id: "pomodoro-focus",
    name: "Pomodoro Focus",
    version: "1.0.0",
    description: "Tactile Pomodoro timer with customizable intervals and local session logging.",
    icon: "Clock",
    trust: "generated",
    capabilities: [],
    surfaces: [
      {
        id: "pomodoro-focus",
        title: "Pomodoro Focus",
        icon: "Clock",
        variant: "immersive",
        entry: "features/pomodoro-focus",
      },
    ],
    permissions: [],
  };

  // Upsert so existing checkouts pick up the fixed timer (working mode
  // switch, whitespace grouping, sentence case) without duplicate rows.
  const existing = count > 0
    ? (db.query<any, ["string"]>("SELECT code FROM registry_plugins WHERE id = ?").get("pomodoro-focus") as any)
    : null;
  if (existing && typeof existing.code === "string" && existing.code.includes("setMode")) {
    return;
  }
  if (existing) {
    db.query(
      "UPDATE registry_plugins SET description = ?, manifest_json = ?, code = ?, updated_at = ? WHERE id = ?"
    ).run(
      "Tactile Pomodoro timer with customizable intervals and local session logging.",
      JSON.stringify(pomodoroManifest),
      pomodoroCode,
      now,
      "pomodoro-focus"
    );
    return;
  }

  db.query(`
    INSERT INTO registry_plugins (id, name, description, icon, version, author, tags_json, manifest_json, code, downloads, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 48, ?, ?)
  `).run(
    "pomodoro-focus",
    "Pomodoro Focus",
    "Tactile Pomodoro timer with customizable intervals and local session logging.",
    "Clock",
    "1.0.0",
    "PolyDocks Team",
    JSON.stringify(["productivity", "timer", "focus"]),
    JSON.stringify(pomodoroManifest),
    pomodoroCode,
    now,
    now
  );
}
