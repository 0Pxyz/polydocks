import { ArrowLeft, BookOpen, Layers, Terminal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CityViewProps {
  cityName: string;
  onBackToWorld: () => void;
}

export function CityView({ cityName, onBackToWorld }: CityViewProps) {
  return (
    <div className="flex-1 flex flex-col p-6 sm:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToWorld}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            World Map
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-display font-semibold text-foreground text-sm">{cityName}</span>
        </div>
        <Badge variant="outline" className="border-primary/40 text-primary gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          Active Workspace
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
        <div className="md:col-span-2 rounded-xl border border-border bg-card p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono text-primary uppercase tracking-wider">Concept Node</span>
            <h2 className="font-display text-2xl font-bold text-foreground mt-1 mb-3">{cityName}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This persistent workspace is synthesized by the agent. Sources, research papers, notes, and dynamic tools are mounted here.
            </p>
          </div>
          <div className="mt-8 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>Dock Control: Standby</span>
            <span>Agent: muse-spark-1.3</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card/60 p-4">
            <h4 className="text-xs font-mono uppercase text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Dock Tools Mounted
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-foreground">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>Primary Sources Browser</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-foreground">
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Workspace Terminal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
