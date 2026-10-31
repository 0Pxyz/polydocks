import type { OnboardingStep } from "@/lib/store/useOnboardingStore";
import { ONBOARDING_STEPS } from "@/lib/store/useOnboardingStore";

/**
 * Agent entry path for the walkthrough (#250 follow-up).
 *
 * Capability-side events (`onboarding.started`, …) are not forwarded over
 * SSE — the dynamic capability tools call `bus.invoke` without an `emit`
 * channel — so the client detects onboarding use from the tool call itself:
 * either the `invoke_capability` escape hatch (`{ id: "onboarding.start" }`)
 * or the generated `cap.onboarding.*` tool. Pure function; the caller
 * applies the returned intent to the onboarding store (which owns the
 * dock tab). Unknown tools return null — never a false open.
 */

export type OnboardingIntent =
  | { action: "start"; replay: boolean }
  | { action: "step"; step: OnboardingStep }
  | { action: "skip" }
  | { action: "replay" };

const STEP_IDS = new Set(ONBOARDING_STEPS.map((s) => s.id));

function intentFromCapabilityId(
  capabilityId: string,
  input: Record<string, unknown>
): OnboardingIntent | null {
  if (!capabilityId.startsWith("onboarding.")) return null;
  const verb = capabilityId.slice("onboarding.".length);
  switch (verb) {
    case "start":
      return { action: "start", replay: (input as any)?.replay === true };
    case "step": {
      const stepId = (input as any)?.stepId;
      if (typeof stepId === "string" && STEP_IDS.has(stepId as OnboardingStep)) {
        return { action: "step", step: stepId as OnboardingStep };
      }
      return null;
    }
    case "skip":
      return { action: "skip" };
    case "replay":
      return { action: "replay" };
    default:
      return null;
  }
}

/**
 * Maps one tool invocation to an onboarding intent, or null when the tool
 * is not the walkthrough. `name` is the executed tool name, `args` its
 * (already parsed) arguments.
 */
export function onboardingIntentFromTool(
  name: string,
  args: unknown
): OnboardingIntent | null {
  const input = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  if (name === "invoke_capability" && typeof (input as any)?.id === "string") {
    return intentFromCapabilityId((input as any).id, ((input as any).input ?? {}) as Record<string, unknown>);
  }
  if (name.startsWith("cap.onboarding.")) {
    return intentFromCapabilityId(name.slice("cap.".length), input);
  }
  return null;
}
