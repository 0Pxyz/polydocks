import { ThemeCustomizerView } from "@/features/theme/ThemeCustomizerView";
import { AccountSettingsView } from "@/features/settings/AccountSettingsView";
import { MemoryInspectorView } from "@/features/settings/MemoryInspectorView";

/**
 * Settings surface: a single scroll with the Appearance customizer on top
 * and account management below. No tabs: the customizer stays frameless
 * and centered (sized to its content, no inner scroll), account cards
 * follow at reading measure. `onDismiss` is intentionally not forwarded
 * to the customizer: its outside-click dismiss would treat clicks on the
 * account section as "outside" and close the surface mid-form.
 */
export function SettingsView() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center gap-8 overflow-x-hidden overflow-y-auto p-4">
      <ThemeCustomizerView />
      <div className="mx-auto w-full max-w-2xl">
        <MemoryInspectorView />
      </div>
      <div className="mx-auto w-full max-w-2xl">
        <AccountSettingsView />
      </div>
    </div>
  );
}
