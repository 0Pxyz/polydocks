/** Seeded pomodoro guest code (kit v2). See seeds header in bitcoin.code.ts. */
export const POMODORO_CODE = `
    import { Stack, Inline, Countdown, useCountdown, SegmentedControl, List, ListRow, Caption } from "@/components/ui/kit";
    import { Button } from "@/components/ui/button";
    import { useEffect, useState } from "react";
    import { createRoot } from "react-dom/client";

    const LENGTHS = { work: 25 * 60, break: 5 * 60 };

    function bridge() {
      return window.polymax || {};
    }

    function App() {
      const [mode, setMode] = useState("work");
      const [running, setRunning] = useState(false);
      const [sessions, setSessions] = useState([]);
      const [secs, reset] = useCountdown(LENGTHS[mode], running);

      useEffect(function () {
        bridge().storage.get("pomodoro_sessions").then(function (saved) {
          if (Array.isArray(saved)) setSessions(saved);
        }).catch(function () {});
      }, []);

      useEffect(function () {
        if (secs === 0 && running) {
          setRunning(false);
          const entry = { mode: mode, timestamp: Date.now() };
          const next = sessions.concat([entry]);
          setSessions(next);
          bridge().storage.set("pomodoro_sessions", next).catch(function () {});
        }
      }, [secs, running]);

      const pick = function (next) {
        if (running) return;
        setMode(next);
      };
      React.useEffect(function () { reset(); }, [mode]);

      return (
        <Stack gap={16}>
          <SegmentedControl
            value={mode}
            onChange={pick}
            options={[{ value: "work", label: "Focus 25m" }, { value: "break", label: "Break 5m" }]}
          />
          <Countdown seconds={secs} caption={running ? "Stay with it." : "Paused."} />
          <Inline gap={8}>
            <Button size="sm" onClick={function () { setRunning(function (r) { return !r; }); }}>
              {running ? "Pause" : "Start session"}
            </Button>
            <Button size="sm" variant="ghost" onClick={function () { setRunning(false); reset(); }}>
              Reset
            </Button>
          </Inline>
          <Stack gap={8}>
            <Caption>Completed sessions: {sessions.length}</Caption>
            <List>
              {sessions.slice(-5).reverse().map(function (s, i) {
                return (
                  <ListRow
                    key={s.timestamp + "-" + i}
                    title={s.mode === "work" ? "Focus" : "Break"}
                    meta={new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  />
                );
              })}
            </List>
          </Stack>
        </Stack>
      );
    }

    createRoot(document.getElementById("app")).render(<App />);
`;
