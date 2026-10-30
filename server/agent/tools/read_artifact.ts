import { z } from "zod";
import type { AgentTool } from "./types";
import { agentArtifacts } from "../../facade/shared";

export const read_artifact: AgentTool<{ artifactId: string }> = {
  name: "read_artifact",
  description:
    "Reads one workspace artifact by id (read-only). Use to reuse prior outputs instead of rebuilding them.",
  schema: z.object({
    artifactId: z.string().min(1).describe("Artifact id to read"),
  }),
  execute: async (args) => agentArtifacts("read", { artifactId: args.artifactId }),
};
