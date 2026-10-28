import type { CityBuildEvent } from "../../src/features/world/types";
import type { TinyFishAdapter } from "../discovery/tinyfish";

export type { CityBuildEvent };
export type BuildDepth = "overview" | "deep" | "mastery";

export interface CityBuilderContext {
  cityId: string;
  topic: string;
  depth: BuildDepth;
  tinyfish: TinyFishAdapter;
  emitEvent: (event: CityBuildEvent) => void;
}

export interface CityBuilderStage<Input, Output> {
  name: string;
  run(input: Input, ctx: CityBuilderContext): Promise<Output>;
}
