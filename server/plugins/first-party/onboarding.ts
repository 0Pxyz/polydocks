import { z } from "zod";
import { pluginRegistry } from "../registry";
import { capabilityBus } from "../bus";
import type { PluginManifest } from "../manifest";

export const onboardingPluginManifest: PluginManifest = {
  apiVersion: 1,
  id: "onboarding",
  name: "Live Onboarding Demo",
  version: "1.0.0",
  description: "Autonomous live product walkthrough orchestrated directly by Poly",
  icon: "PlayCircle",
  trust: "first-party",
  capabilities: [
    {
      id: "onboarding.start",
      title: "Start Live Demo",
      description: "Starts the live interactive onboarding walkthrough led by Poly.",
      input: z.object({
        replay: z.boolean().default(false),
      }),
      risk: "read",
    },
    {
      id: "onboarding.step",
      title: "Step Choreography",
      description: "Advances or navigates between steps of the live product demo.",
      input: z.object({
        stepId: z.enum(["home", "customize", "research", "read", "build", "remember", "handoff"]),
        autoAdvance: z.boolean().default(true),
      }),
      risk: "read",
    },
    {
      id: "onboarding.skip",
      title: "Skip Onboarding",
      description: "Dismisses the live demo and transitions the workspace to idle Home state.",
      input: z.object({}),
      risk: "read",
    },
    {
      id: "onboarding.replay",
      title: "Replay Live Demo",
      description: "Resets the demo state and restarts the choreography from the beginning.",
      input: z.object({}),
      risk: "read",
    },
  ],
  surfaces: [
    {
      id: "onboarding",
      title: "Product Walkthrough",
      icon: "PlayCircle",
      variant: "immersive",
      entry: "OnboardingPluginView",
    },
  ],
  permissions: [],
};

export function registerOnboardingPlugin(): void {
  pluginRegistry.install(onboardingPluginManifest);

  let currentStep: "idle" | "home" | "customize" | "research" | "read" | "build" | "remember" | "handoff" = "idle";

  capabilityBus.register("onboarding", onboardingPluginManifest.capabilities[0], async (input, ctx) => {
    currentStep = "home";
    if (ctx.emit) {
      await ctx.emit({
        type: "onboarding.started",
        payload: { step: currentStep, replay: input.replay },
      });
    }
    return {
      status: "started",
      step: currentStep,
      steps: ["home", "customize", "research", "read", "build", "remember", "handoff"],
    };
  });

  capabilityBus.register("onboarding", onboardingPluginManifest.capabilities[1], async (input, ctx) => {
    currentStep = input.stepId;
    if (ctx.emit) {
      await ctx.emit({
        type: "onboarding.stepped",
        payload: { step: currentStep, autoAdvance: input.autoAdvance },
      });
    }
    return {
      status: "active",
      step: currentStep,
    };
  });

  capabilityBus.register("onboarding", onboardingPluginManifest.capabilities[2], async (_input, ctx) => {
    currentStep = "idle";
    if (ctx.emit) {
      await ctx.emit({
        type: "onboarding.completed",
        payload: { reason: "skipped" },
      });
    }
    return {
      status: "completed",
      step: "idle",
    };
  });

  capabilityBus.register("onboarding", onboardingPluginManifest.capabilities[3], async (_input, ctx) => {
    currentStep = "home";
    if (ctx.emit) {
      await ctx.emit({
        type: "onboarding.started",
        payload: { step: currentStep, replay: true },
      });
    }
    return {
      status: "replayed",
      step: currentStep,
    };
  });
}
