import { useState } from "react";
import { Terminal as TerminalIcon, CornerDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TerminalViewProps {
  cityId: string;
  cityName: string;
  notesCount: number;
  sourcesCount: number;
}

export function TerminalView({
  cityId,
  cityName,
  notesCount,
  sourcesCount,
}: TerminalViewProps) {
  const [command, setCommand] = useState<string>("");
  const [logs, setLogs] = useState<Array<{ text: string; type: "info" | "system" | "prompt" }>>([
    { text: `[Polymax Workspace Subsystem v0.1.0]`, type: "system" },
    { text: `Mounting workspace: workspace/${cityId}/`, type: "info" },
    { text: `Agent runtime connected: muse-spark-1.3 (Meta Model API)`, type: "info" },
    { text: `City indexed: ${cityName} (Notes: ${notesCount}, Sources: ${sourcesCount})`, type: "info" },
    { text: `Type 'help' or describe a tool you want to synthesize.`, type: "system" },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const cmd = command.trim();
    setLogs((prev) => [...prev, { text: `> ${cmd}`, type: "prompt" }]);
    setCommand("");

    // Minimal command processor
    if (cmd === "help") {
      setLogs((prev) => [
        ...prev,
        { text: `Available commands:`, type: "system" },
        { text: `  status      - Display city indexing status`, type: "info" },
        { text: `  ls          - List workspace files and notes`, type: "info" },
        { text: `  clear       - Clear terminal console`, type: "info" },
        { text: `  synthesize  - Ask agent to synthesize dynamic tool tab`, type: "info" },
      ]);
    } else if (cmd === "clear") {
      setLogs([]);
    } else if (cmd === "status") {
      setLogs((prev) => [
        ...prev,
        { text: `Active City: ${cityName} (${cityId})`, type: "info" },
        { text: `Storage Path: workspace/${cityId}/`, type: "info" },
        { text: `Loaded notes: ${notesCount} | Curated sources: ${sourcesCount}`, type: "info" },
      ]);
    } else if (cmd === "ls") {
      setLogs((prev) => [
        ...prev,
        { text: `workspace/${cityId}/:`, type: "system" },
        { text: `  notes/`, type: "info" },
        { text: `  sources/`, type: "info" },
        { text: `  features/`, type: "info" },
        { text: `  feed.json`, type: "info" },
      ]);
    } else {
      setLogs((prev) => [
        ...prev,
        { text: `[Agent Event] Command received: "${cmd}". Routing to dock agent loop...`, type: "system" },
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
          <Badge variant="outline" className="border-primary/30 text-primary text-[10px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            muse-spark-1.3
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
          placeholder="Enter command or prompt (e.g. 'status', 'ls', 'help')..."
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
