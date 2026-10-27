import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock } from "@/features/dock/AgenticDock";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function App() {
  return (
    <AppProviders>
      <RootLayout>
        <div className="relative min-h-screen w-full flex items-center justify-center bg-background text-foreground overflow-hidden select-none">
          {/* Subtle ambient glow & grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 50%, rgba(200, 255, 87, 0.06) 0%, transparent 60%),
                linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 32px 32px, 32px 32px",
            }}
          />

          {/* Discreet Theme Switcher in the top right corner */}
          <div className="absolute top-4 right-4 z-50">
            <ThemeSwitcher />
          </div>

          {/* The Exact Centered Agentic Dock HUD */}
          <main className="relative z-10 flex flex-col items-center justify-center p-4">
            <AgenticDock />
          </main>
        </div>
      </RootLayout>
    </AppProviders>
  );
}
