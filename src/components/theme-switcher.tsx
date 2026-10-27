import { THEMES, useThemeStore } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Palette, Check } from "lucide-react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();
  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border/80 bg-card/60 backdrop-blur-sm hover:border-primary/50"
        >
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-border"
            style={{ backgroundColor: currentTheme.accentColor }}
          />
          <span className="text-xs font-medium">{currentTheme.name}</span>
          <Palette className="h-3.5 w-3.5 text-muted-foreground ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 bg-card border-border">
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id)}
            className="flex items-center justify-between cursor-pointer text-xs py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-border"
                style={{ backgroundColor: t.accentColor }}
              />
              <span>{t.name}</span>
            </div>
            {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
