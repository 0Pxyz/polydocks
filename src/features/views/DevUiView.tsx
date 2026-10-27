import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { THEMES, useThemeStore } from "@/lib/theme";
import { Sparkles, Code2, Layers, ShieldCheck } from "lucide-react";

export function DevUiView() {
  const { theme } = useThemeStore();
  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="flex-1 p-6 sm:p-10 max-w-5xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary gap-1 font-mono text-xs">
          <Code2 className="h-3 w-3" />
          Design System & Theme Showcase
        </Badge>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
          Theme Playground: {currentTheme.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dark-only design tokens, typography, and shadcn primitives with live theme switching.
        </p>
      </div>

      {/* Typography Preview */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Typography Tokens</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-3 rounded-lg bg-background border border-border/60">
            <span className="text-xs font-mono text-primary">font-display (Syne)</span>
            <p className="font-display text-xl font-bold mt-1 text-foreground">The Agentic Dock</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/60">
            <span className="text-xs font-mono text-primary">font-sans (Inter)</span>
            <p className="font-sans text-sm mt-1 text-foreground">Autonomous workspace and knowledge game</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border/60">
            <span className="text-xs font-mono text-primary">font-mono (Geist Mono)</span>
            <p className="font-mono text-xs mt-1 text-foreground">muse-spark-1.3 @ 60fps</p>
          </div>
        </div>
      </div>

      {/* Color Tokens Swatches */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Active CSS Theme Tokens</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 rounded-lg bg-background border border-border">
            <div className="h-6 w-full rounded bg-background border border-border mb-2" />
            <p className="text-xs font-mono text-muted-foreground">--background</p>
            <p className="text-xs font-semibold text-foreground">{currentTheme.bgColor}</p>
          </div>
          <div className="p-3 rounded-lg bg-card border border-border">
            <div className="h-6 w-full rounded bg-card border border-border mb-2" />
            <p className="text-xs font-mono text-muted-foreground">--card / surface</p>
            <p className="text-xs font-semibold text-foreground">Surface Card</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border">
            <div className="h-6 w-full rounded bg-primary mb-2" />
            <p className="text-xs font-mono text-muted-foreground">--primary / accent</p>
            <p className="text-xs font-semibold text-foreground">{currentTheme.accentColor}</p>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border">
            <div className="h-6 w-full rounded bg-border mb-2" />
            <p className="text-xs font-mono text-muted-foreground">--border</p>
            <p className="text-xs font-semibold text-foreground">Subtle Border</p>
          </div>
        </div>
      </div>

      {/* Button & Input Primitives */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Interactive Primitives</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="default" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Primary Button
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
          <Input placeholder="Enter prompt or search term..." className="bg-background" />
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">XP 65%</span>
            <Progress value={65} className="flex-1" />
          </div>
        </div>
      </div>

      {/* Tabs Component */}
      <div className="rounded-xl border border-border bg-card p-6">
        <Tabs defaultValue="overview">
          <TabsList className="bg-background border border-border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dock">Agentic Dock</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Polymax is designed around a single, persistent Agentic Dock. Every experience connects to an active knowledge workspace.
          </TabsContent>
          <TabsContent value="dock" className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Dock tools synthesize dynamically via Meta Model API inside sandboxed runtimes.
          </TabsContent>
          <TabsContent value="security" className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Strict typed filesystem grants and content boundary isolation enforced.
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
