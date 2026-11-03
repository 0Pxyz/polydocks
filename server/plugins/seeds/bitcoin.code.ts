/**
 * Seeded first-party plugin guest code (kit v2).
 *
 * Each file exports one guest-code string. The registry imports it and
 * only owns manifest + upsert logic — add future plugins here, never
 * as inline strings in communityRegistry.ts.
 */
export const BITCOIN_CODE = `
    import { Button } from "@/components/ui/button";
    import { Skeleton } from "@/components/ui/skeleton";
    import { Stack, Metric, SegmentedControl, InlineMessage, Caption, AreaChart } from "@/components/ui/kit";
    import { useEffect, useRef, useState } from "react";
    import { createRoot } from "react-dom/client";

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

      return (
        <Stack gap={16}>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={"inline-block h-2 w-2 rounded-full " + (conn === "live" ? "bg-primary animate-pulse" : conn === "error" ? "bg-destructive" : "bg-muted-foreground animate-pulse")}
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold">Bitcoin · Live price</h2>
              <Caption>{connLabel(conn)}</Caption>
            </div>
            {candles.length === 0 && conn !== "error" ? (
              <div className="mt-2 flex flex-col gap-2">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <div className="mt-2">
                <Metric
                  value={fmt(last)}
                  delta={(up ? "▲ " : "▼ ") + fmt(Math.abs(change)) + " (" + (up ? "+" : "") + pct.toFixed(2) + "%)"}
                  caption={frame + " · H " + fmt(high) + " · L " + fmt(low) + " · " + source + " " + pair}
                />
              </div>
            )}
          </div>

          {conn === "error" ? (
            <Stack gap={8}>
              <InlineMessage tone="error">Feed offline — {error || "price feed unreachable."}</InlineMessage>
              <Button size="sm" onClick={function () { setNonce(function (n) { return n + 1; }); }}>
                Retry
              </Button>
            </Stack>
          ) : (
            <AreaChart values={candles.map(function (c) { return c.c; })} height={160} stroke="#f7931a" label="Bitcoin price chart" />
          )}

          <Stack gap={8}>
            <SegmentedControl
              value={frame}
              onChange={function (v) { setFrame(v); }}
              options={FRAMES.map(function (t) { return { value: t, label: t }; })}
            />
            <SegmentedControl
              value={fiat}
              onChange={function (v) { setFiat(v); }}
              options={FIATS.map(function (c) { return { value: c, label: c }; })}
            />
          </Stack>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={function () { setPaused(function (v) { return !v; }); }}>
              {paused ? "Resume feed" : "Pause feed"}
            </Button>
            <Caption>{"Live via " + (source || "exchange") + " · " + pair}</Caption>
          </div>
        </Stack>
      );
    }

    createRoot(document.getElementById("app")).render(<App />);
`;
