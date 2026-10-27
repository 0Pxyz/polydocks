import type React from "react";

export function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans">
      {children}
    </div>
  );
}
