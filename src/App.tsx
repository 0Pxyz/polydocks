import { useState } from "react";
import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { WorldView } from "@/features/views/WorldView";
import { CityView } from "@/features/views/CityView";
import { DevUiView } from "@/features/views/DevUiView";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Globe, Building2, Palette } from "lucide-react";

export type ActiveView = "world" | "city" | "dev-ui";

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>("world");
  const [selectedCity, setSelectedCity] = useState<string>("Stoicism");

  const handleEnterCity = (cityName: string) => {
    setSelectedCity(cityName);
    setActiveView("city");
  };

  return (
    <AppProviders>
      <RootLayout>
        <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
          {/* Top Control Bar with Modular View Switcher & Theme Selector */}
          <header className="border-b border-border/70 bg-card/40 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-display font-extrabold text-lg text-primary tracking-tight">
                Polymax
              </span>
              <span className="hidden sm:inline text-xs font-mono text-muted-foreground border-l border-border pl-3">
                Agentic Dock
              </span>
            </div>

            {/* Modular View Switcher */}
            <nav className="flex items-center gap-1.5 bg-background/60 p-1 rounded-lg border border-border">
              <Button
                variant={activeView === "world" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setActiveView("world")}
              >
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">World Map</span>
              </Button>
              <Button
                variant={activeView === "city" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setActiveView("city")}
              >
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">City Workspace</span>
              </Button>
              <Button
                variant={activeView === "dev-ui" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setActiveView("dev-ui")}
              >
                <Palette className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Theme Showcase</span>
              </Button>
            </nav>

            {/* Theme Switcher Component */}
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
            </div>
          </header>

          {/* Active Modular View */}
          <main className="flex-1 flex flex-col">
            {activeView === "world" && <WorldView onEnterCity={handleEnterCity} />}
            {activeView === "city" && (
              <CityView cityName={selectedCity} onBackToWorld={() => setActiveView("world")} />
            )}
            {activeView === "dev-ui" && <DevUiView />}
          </main>
        </div>
      </RootLayout>
    </AppProviders>
  );
}
