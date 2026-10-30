import { useState } from "react";
import { Terminal as TerminalIcon, CornerDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TerminalViewProps {
  cityId: string;
  cityName: string;
  notesCount: number;
  sourcesCount: number;
}

interface LogLine {
  text: string;
  type: "info" | "system" | "prompt";
}

/**
 * Workspace terminal (local inspection only). Built-in commands run against
 * real workspace state (`ls` lists actual files via the cities API;
 * `status` reports the real counts passed in as props). Anything else is
 * answered honestly: this console is not connected to the agent loop — ask
 * the Agent to run or build something.
 */
export function TerminalView({
  cityId,
  cityName,
  notesCount,
  sourcesCount,
}: TerminalViewProps) {
  const [command, setCommand] = useState<string>("");
  const [logs, setLogs] = useState<LogLine[]>([
    { text: `Workspace terminal — workspace/${cityId}/ (local inspection only)`, type: "system" },
    { text: `City: ${cityName} (Notes: ${notesCount}, Sources: ${sourcesCount})`, type: "info" },
    { text: `Type 'help' for available commands. This console is not connected to the agent.`, type: "system" },
  ]);

  const push = (lines: LogLine[]) => setLogs((prev) => [...prev, ...lines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const cmd = command.trim();
    push([{ text: `> ${cmd}`, type: "prompt" }]);
    setCommand("");

    const [verb, ...rest] = cmd.split(/\s+/);
    void rest;

    // Local commands
    if (cmd === "help") {
      push([
        { text: `Available commands:`, type: "system" },
        { text: `  status      - Display real city indexing status`, type: "info" },
        { text: `  ls          - List real workspace files`, type: "info" },
        { text: `  clear       - Clear terminal console`, type: "info" },
        { text: `Anything else is not executed here — ask the Agent.`, type: "system" },
      ]);
    } else if (cmd === "clear") {
      setLogs([]);
    } else if (cmd === "status") {
      push([
        { text: `Active City: ${cityName} (${cityId})`, type: "info" },
        { text: `Storage Path: workspace/${cityId}/`, type: "info" },
        { text: `Loaded notes: ${notesCount} | Curated sources: ${sourcesCount}`, type: "info" },
      ]);
    } else if (verb === "ls") {
      void (async () => {
        try {
          const res = await fetch(`/api/cities/${encodeURIComponent(cityId)}/files`);
          if (!res.ok) throw new Error(`server responded ${res.status}`);
          const data = await res.json();
          const files = (data.files || []) as Array<{ path: string }>;
          if (files.length === 0) {
            push([{ text: `workspace/${cityId}/: (empty)`, type: "system" }]);
          } else {
            push([
              { text: `workspace/${cityId}/:`, type: "system" },
              ...files.slice(0, 50).map((f) => ({ text: `  ${f.path}`, type: "info" as const })),
              ...(files.length > 50 ? [{ text: `  …and ${files.length - 50} more`, type: "info" as const }] : []),
            ]);
          }
        } catch {
          push([{ text: `Couldn't list files (request failed).`, type: "system" }]);
        }
      })();
    } else {
      push([
        { text: `"${cmd}" is not a terminal command here.`, type: "system" },
        { text: `Ask the Agent (e.g. "run ...", "analyze ...") — it executes through real tools.`, type: "info" },
      ]);
    }
  };

  return (
    <div className="flex flex-col w-full h-[520px] rounded-xl border border-border bg-[#0a0d14] overflow-hidden font-mono text-xs">
      {/* Top terminal bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#121620] border-b border-border/80 text-muted-foreground">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-xs">{cityName} Terminal</span>
          <span className="text-border">|</span>
          <span className="text-[11px] text-muted-foreground">workspace/{cityId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-white/15 text-muted-foreground text-[10px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            local only
          </Badge>
        </div>
      </div>

      {/* Terminal logs output */}
      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 text-xs">
        {logs.map((log, i) => (
          <div
            key={i}
            className={`leading-relaxed ${
              log.type === "system"
                ? "text-[var(--accent-lime)]"
                : log.type === "prompt"
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            }`}
          >
            {log.text}
          </div>
        ))}
      </div>

      {/* Prompt input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 bg-[#121620]/80 border-t border-border">
        <span className="text-[var(--accent-lime)] font-bold">{cityName.toLowerCase()}&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type 'help', 'status', 'ls'..."
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none text-xs"
        />
        <button
          type="submit"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
