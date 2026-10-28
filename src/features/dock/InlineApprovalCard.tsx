import { useState } from "react";
import { ShieldWarning, Globe, Warning, Check, X, ShieldCheck } from "@phosphor-icons/react";

export interface InlineApprovalCardProps {
  id: string;
  pluginId: string;
  capabilityId: string;
  risk: "read" | "write" | "destructive" | "external";
  scope: string;
  summary: string;
  onDecision?: (decision: "allow_once" | "allow_always" | "deny") => void;
  className?: string;
}

export function InlineApprovalCard({
  id,
  pluginId,
  capabilityId,
  risk,
  scope,
  summary,
  onDecision,
  className = "",
}: InlineApprovalCardProps) {
  const [loadingDecision, setLoadingDecision] = useState<string | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<string | null>(null);

  const handleResolve = async (decision: "allow_once" | "allow_always" | "deny") => {
    setLoadingDecision(decision);
    try {
      const res = await fetch(`/api/capabilities/approvals/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        setResolvedDecision(decision);
        onDecision?.(decision);
      }
    } catch {
      // Optimistic update
      setResolvedDecision(decision);
      onDecision?.(decision);
    } finally {
      setLoadingDecision(null);
    }
  };

  const getRiskTheme = () => {
    switch (risk) {
      case "destructive":
        return {
          border: "border-red-500/30",
          badgeBg: "bg-red-500/15 text-red-400 border-red-500/30",
          icon: <Warning className="w-4 h-4 text-red-400" weight="bold" />,
          label: "Destructive Action",
        };
      case "external":
        return {
          border: "border-amber-500/30",
          badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: <Globe className="w-4 h-4 text-amber-300" weight="bold" />,
          label: "External Network",
        };
      case "write":
        return {
          border: "border-orange-500/30",
          badgeBg: "bg-orange-500/15 text-orange-300 border-orange-500/30",
          icon: <ShieldWarning className="w-4 h-4 text-orange-300" weight="bold" />,
          label: "Filesystem Write",
        };
      default:
        return {
          border: "border-blue-500/30",
          badgeBg: "bg-blue-500/15 text-blue-300 border-blue-500/30",
          icon: <ShieldCheck className="w-4 h-4 text-blue-300" weight="bold" />,
          label: "Restricted Read",
        };
    }
  };

  const theme = getRiskTheme();

  if (resolvedDecision) {
    return (
      <div
        className={`w-full max-w-lg p-3 rounded-xl bg-white/[0.02] border border-white/10 text-xs text-white/60 flex items-center justify-between ${className}`}
      >
        <div className="flex items-center gap-2">
          {resolvedDecision === "deny" ? (
            <X className="w-4 h-4 text-red-400" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400" />
          )}
          <span>
            Action {resolvedDecision === "deny" ? "denied" : "approved"}:{" "}
            <span className="font-mono text-white/80">{capabilityId}</span>
          </span>
        </div>
        <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">
          {resolvedDecision}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`w-full max-w-lg p-4 rounded-xl bg-[#0c0e14]/95 backdrop-blur-md border ${theme.border} shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none ${className}`}
    >
      {/* Header & Risk Tag */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {theme.icon}
          <span className="text-xs font-medium text-white/90">Authorization Required</span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider ${theme.badgeBg}`}
        >
          {theme.label}
        </span>
      </div>

      {/* Description / Summary */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-sans text-white/90 leading-snug">{summary}</p>
        <div className="flex items-center gap-2 text-[11px] text-white/50 font-mono">
          <span>Plugin: {pluginId}</span>
          <span>•</span>
          <span>Scope: {scope}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
        <button
          type="button"
          disabled={Boolean(loadingDecision)}
          onClick={() => handleResolve("deny")}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50"
        >
          Deny
        </button>

        <button
          type="button"
          disabled={Boolean(loadingDecision)}
          onClick={() => handleResolve("allow_once")}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white active:scale-95 transition-all disabled:opacity-50"
        >
          {loadingDecision === "allow_once" ? "Approving…" : "Allow Once"}
        </button>

        <button
          type="button"
          disabled={Boolean(loadingDecision)}
          onClick={() => handleResolve("allow_always")}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 active:scale-95 transition-all disabled:opacity-50"
        >
          {loadingDecision === "allow_always" ? "Approving…" : "Always Allow"}
        </button>
      </div>
    </div>
  );
}
