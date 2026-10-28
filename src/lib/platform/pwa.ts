/**
 * PWA install affordances (platform layer: the only place allowed to touch
 * browser install events and display-mode state).
 */

export type PwaInstallStatus = "standalone" | "prompt-ready" | "ios-hint" | "unavailable";

export interface InstallStatusInput {
  isStandalone: boolean;
  hasBeforeInstallPrompt: boolean;
  isIOS: boolean;
}

export function resolveInstallStatus(input: InstallStatusInput): PwaInstallStatus {
  if (input.isStandalone) return "standalone";
  if (input.hasBeforeInstallPrompt) return "prompt-ready";
  if (input.isIOS) return "ios-hint";
  return "unavailable";
}

export function isIOS(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function isStandaloneDisplay(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // Legacy iOS Safari flag
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const statusListeners = new Set<(status: PwaInstallStatus) => void>();

function notifyStatus(): void {
  const status = getInstallStatus();
  for (const listener of statusListeners) {
    listener(status);
  }
}

function handleBeforeInstallPrompt(event: Event): void {
  // We surface our own install entry point and call prompt() explicitly on
  // user action, so the default browser UI stays reserved for that moment.
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notifyStatus();
}

function handleAppInstalled(): void {
  deferredPrompt = null;
  installedFlag = true;
  notifyStatus();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
}

/** Whether the browser fired the native install prompt event this session. */
let installedFlag = false;

export function getInstallStatus(): PwaInstallStatus {
  if (installedFlag) return "standalone";
  if (isStandaloneDisplay()) return "standalone";
  if (deferredPrompt) return "prompt-ready";
  if (typeof navigator !== "undefined" && isIOS(navigator.userAgent)) return "ios-hint";
  return "unavailable";
}

/** Subscribe to install status changes. Returns an unsubscribe function. */
export function subscribeInstallStatus(
  listener: (status: PwaInstallStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(getInstallStatus());
  return () => statusListeners.delete(listener);
}

/** Fire the native install prompt. Returns the user's choice or null. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  if (!deferredPrompt) return null;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome;
}
