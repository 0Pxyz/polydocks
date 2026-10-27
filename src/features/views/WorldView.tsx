import { Globe, Compass, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WorldViewProps {
  onEnterCity: (cityName: string) => void;
}

export function WorldView({ onEnterCity }: WorldViewProps) {
  const mockRegions = [
    {
      id: "ai",
      name: "Artificial Intelligence",
      cities: ["Neural Networks", "Transformer Architectures"],
    },
    {
      id: "phil",
      name: "Philosophy & Mind",
      cities: ["Stoicism", "Epistemology"],
    },
    {
      id: "quantum",
      name: "Quantum Mechanics",
      cities: ["Entanglement", "Superposition"],
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 max-w-5xl mx-auto w-full">
      <div className="text-center mb-8">
        <Badge variant="outline" className="mb-3 gap-1.5 border-primary/30 text-primary">
          <Globe className="h-3.5 w-3.5" />
          Living World Map
        </Badge>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          Explore Knowledge Domains
        </h1>
        <p className="mt-3 text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
          Disciplines form procedural regions. Concepts become explorable cities with active workspaces.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {mockRegions.map((region) => (
          <div
            key={region.id}
            className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Region</span>
              <Compass className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
            </div>
            <h3 className="font-display font-semibold text-lg text-foreground mb-4">{region.name}</h3>
            <div className="space-y-2">
              {region.cities.map((city) => (
                <Button
                  key={city}
                  variant="secondary"
                  size="sm"
                  className="w-full justify-between text-xs"
                  onClick={() => onEnterCity(city)}
                >
                  <span>{city}</span>
                  <Sparkles className="h-3 w-3 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
