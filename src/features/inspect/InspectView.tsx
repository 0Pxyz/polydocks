import { useEffect, useMemo, useState } from "react";
import { useConversationStore } from "@/lib/agent/conversationStore";
import { buildInspectRows, type InspectRow, type RawInspectEvent } from "@/lib/inspect/inspectRows";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartLineUp } from "@phosphor-icons/react";

interface JobState {
  id: string;
  type: string;
  status: string;
  progress?: number;
  updatedAt: number;
}

const LISTEN_TYPES = [
  "agent.start",
  "agent.finish",
  "tool.start",
  "tool.done",
  "browser.open",
  "error",
  "plugin.created",
  "plugin.updated",
  "plugin.published",
  "plugin.operated",
  "message.done",
  "message.error",
  "job.queued",
  "job.started",
  "job.progress",
  "job.completed",
  "job.failed",
  "job.cancelled",
  "job.interrupted",
  "dock.layout",
  "theme.apply",
];

function shortId(id: string): string {
  const tail = id.replace(/^task_/, "");
  return tail.length > 12 ? tail.slice(-8) : tail;
}

function Section({ title, rows }: { title: string; rows: InspectRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">{title}</p>
      {rows.slice(-30).map((row) => (
        <div key={`${row.kind}-${row.seq}`} className="flex items-baseline gap-2 text-xs font-mono">
          <span className={row.kind === "error" ? "text-red-400 shrink-0" : "text-[var(--accent-lime)] shrink-0"}>
            {row.kind === "error" ? "!" : "·"}
          </span>
          <span className="text-white/85 truncate">{row.label}</span>
          {typeof row.at === "number" && (
            <span className="text-white/30 shrink-0">
              {new Date(row.at).toLocaleTimeString([], { hour12: false })}
            </span>
          )}
          {row.detail && <span className="text-white/40 truncate">{row.detail}</span>}
        </div>
      ))}

    </div>
  );
}

/**
 * Inspect developer view (#181): one screen over the live agent runtime.
 * Real events only — rows are built by the shared inspectRows mapper
 * (shapes, never secrets) from the durable tasks stream plus a tasks
 * snapshot for current job states. Dev-only: ToolSurface renders this
 * solely in DEV builds.
 */
export function InspectView() {
  const orchestratorSessionId = useConversationStore((s) => s.orchestratorSessionId);
  const [events, setEvents] = useState<RawInspectEvent[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [loading, setLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState(false);

  useEffect(() => {
    if (!orchestratorSessionId || typeof window === "undefined" || typeof EventSource === "undefined") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/tasks?sessionId=${encodeURIComponent(orchestratorSessionId)}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("snapshot failed");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const next: Record<string, JobState> = {};
        for (const t of Array.isArray(data?.tasks) ? data.tasks : []) {
          if (typeof t?.id !== "string") continue;
          next[t.id] = {
            id: t.id,
            type: typeof t.type === "string" ? t.type : "job",
            status: typeof t.status === "string" ? t.status : "unknown",
            progress: typeof t.progress === "number" ? t.progress : undefined,
            updatedAt: Date.now(),
          };
        }
        setJobs(next);
      } catch {
        if (!cancelled) setSnapshotError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const source = new EventSource(
      `/api/tasks/stream?sessionId=${encodeURIComponent(orchestratorSessionId)}`
    );
    const push = (type: string) => (ev: Event) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        const payload = data && typeof data === "object" ? data : {};
        if (type.startsWith("job.")) {
          const jobId = typeof payload.jobId === "string" ? payload.jobId : typeof payload.taskId === "string" ? payload.taskId : null;
          if (jobId) {
            setJobs((prev) => ({
              ...prev,
              [jobId]: {
                id: jobId,
                type: prev[jobId]?.type ?? "job",
                status: type.slice(4),
                progress: typeof payload.progress === "number" ? payload.progress : prev[jobId]?.progress,
                updatedAt: Date.now(),
              },
            }));
          }
        }
        setEvents((prev) => [...prev.slice(-399), { type, step: 0, at: Date.now(), payload }]);
      } catch {
        // Malformed frames never break the inspector.
      }
    };
    for (const type of LISTEN_TYPES) {
      source.addEventListener(type, push(type) as EventListener);
    }
    return () => {
      cancelled = true;
      try {
        source.close();
      } catch {
        // Ignore close errors on unmount.
      }
    };
  }, [orchestratorSessionId]);

  const rows = useMemo(() => buildInspectRows(events), [events]);
  const requests = useMemo(() => rows.filter((r) => r.kind === "request"), [rows]);
  const decisions = useMemo(() => rows.filter((r) => r.kind === "decision"), [rows]);
  const actions = useMemo(() => rows.filter((r) => r.kind === "action"), [rows]);
  const results = useMemo(() => rows.filter((r) => r.kind === "result" || r.kind === "error"), [rows]);
  const activeJobs = useMemo(
    () => Object.values(jobs).filter((j) => j.status === "queued" || j.status === "running" || j.status === "started" || j.status === "progress"),
    [jobs]
  );

  if (!orchestratorSessionId) {
    return (
      <div className="w-full max-w-2xl px-4 py-8">
        <EmptyState
          icon={<ChartLineUp size={28} />}
          title="Inspect"
          hint="No runtime session yet. Send the agent a message and its requests, routing, jobs and results will appear here."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full max-w-2xl px-4 py-8 flex flex-col gap-3" aria-label="Inspect">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl px-4 py-8 flex flex-col gap-6" aria-label="Inspect">
      <div>
        <h2 className="text-base font-semibold text-white/95">Inspect</h2>
        <p className="text-xs text-white/40 font-sans mt-0.5">
          Live agent runtime · real events only{snapshotError ? " · snapshot unavailable, stream only" : ""}
        </p>
      </div>

      {rows.length === 0 && activeJobs.length === 0 ? (
        <EmptyState
          icon={<ChartLineUp size={28} />}
          title="No runtime events yet"
          hint="Send the agent a message. Requests, routing decisions, jobs and results will land here."
        />
      ) : (
        <>
          {activeJobs.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-white/40">Active jobs</p>
              {activeJobs.map((j) => (
                <div key={j.id} className="flex items-baseline gap-2 text-xs font-mono">
                  <span className="text-[var(--accent-lime)] shrink-0">·</span>
                  <span className="text-white/85 truncate">{j.type}</span>
                  <span className="text-white/40 truncate">
                    {shortId(j.id)} · {j.status} · {new Date(j.updatedAt).toLocaleTimeString([], { hour12: false })}
                    {typeof j.progress === "number" ? ` · ${Math.round(j.progress * 100)}%` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Section title="Requests" rows={requests} />
          <Section title="Routing" rows={decisions} />
          <Section title="Activity" rows={actions} />
          <Section title="Results" rows={results} />
        </>
      )}
    </div>
  );
}
