import { AppProviders } from "@/app/providers";
import { RootLayout } from "@/app/layout";

export default function App() {
  return (
    <AppProviders>
      <RootLayout>
        <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-primary">
            Polymax
          </h1>
          <p className="mt-2 text-muted-foreground font-mono text-sm">
            The Agentic Dock for Polymaths
          </p>
        </main>
      </RootLayout>
    </AppProviders>
  );
}
