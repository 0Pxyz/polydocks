import { useState } from "react";
import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { AccountSettingsView } from "@/features/settings/AccountSettingsView";
import { Button } from "@/components/ui/button";

interface SettingsViewProps {
  onDismiss: (id: string) => void;
}

/**
 * Settings surface: Account (identity, sessions, workspaces) beside the
 * existing Appearance customizer. Local-first: the Account tab explains
 * device-local mode and only asks for credentials when the user opts in.
 */
export function SettingsView({ onDismiss }: SettingsViewProps) {
  const [tab, setTab] = useState<"account" | "appearance">("account");

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={tab === "account" ? "default" : "outline"}
          onClick={() => setTab("account")}
        >
          Account
        </Button>
        <Button
          size="sm"
          variant={tab === "appearance" ? "default" : "outline"}
          onClick={() => setTab("appearance")}
        >
          Appearance
        </Button>
      </div>
      {tab === "account" ? (
        <AccountSettingsView />
      ) : (
        <ThemeCustomizerView onDismiss={() => onDismiss("settings")} />
      )}
    </div>
  );
}
