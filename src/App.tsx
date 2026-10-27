import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";
import { AgenticDock } from "@/features/dock/AgenticDock";

export default function App() {
  return (
    <AppProviders>
      <RootLayout>
        <div className="relative min-h-screen w-full bg-background text-foreground overflow-hidden select-none">
          {/* Subtle ambient glow & grid pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 0%, rgba(200, 255, 87, 0.08) 0%, transparent 60%),
                linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 32px 32px, 32px 32px",
            }}
          />

          {/* Pinned Agentic Dock at the top edge of the screen */}
          <AgenticDock />
        </div>
      </RootLayout>
    </AppProviders>
  );
}
