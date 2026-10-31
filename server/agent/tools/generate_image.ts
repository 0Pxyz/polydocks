import { z } from "zod";
import type { AgentTool } from "./types";
import { generateImage } from "../../media/image";

export const generate_image: AgentTool<{
  prompt: string;
  size?: string;
  outputFormat?: "webp" | "png" | "jpeg";
  kind?: "cover" | "share-card";
  name?: string;
}> = {
  name: "generate_image",
  description:
    "Generate an image with Muse Image (muse-image-1.0) from a chat request: illustrations, covers, share cards. The file is cached under DATA_DIR/image-cache AND saved to the user's artifacts (GET /api/artifacts) so it survives the session. Returns ok:false with a structured retryable error when unconfigured or when generation fails; never claims success without a verified file.",
  schema: z.object({
    prompt: z.string().min(1).max(4000).describe("Image prompt (e.g. 'flat dark cover art about Stoicism, lime accent')"),
    size: z.string().default("1024x1024").describe("Aspect ratio WxH, e.g. 1024x1024 or 1536x1024"),
    outputFormat: z.enum(["webp", "png", "jpeg"]).default("webp"),
    kind: z.enum(["cover", "share-card"]).default("cover").describe("What the image is for (artifact type hint)"),
    name: z.string().max(120).optional().describe("Artifact name (defaults to the first 60 chars of the prompt)"),
  }),
  modelRole: "image",
  execute: async (args, ctx) => {
    const result = await generateImage({
      prompt: args.prompt,
      size: args.size,
      outputFormat: args.outputFormat,
    });
    if (!result.ok) return result;
    // Persist to the user's artifacts so chat-requested images are kept,
    // listed and downloadable beyond the turn that made them.
    let artifactId: string | null = null;
    try {
      const { ArtifactService } = await import("../../services/artifactService");
      const artifact = await ArtifactService.createArtifact({
        workspaceId: ctx.workspaceId || "default",
        sessionId: ctx.sessionId,
        name: (args.name || args.prompt).slice(0, 120),
        type: "image",
        path: result.path,
        metadata: {
          url: result.url,
          prompt: args.prompt,
          kind: args.kind ?? "cover",
          model: result.model,
          bytes: result.bytes,
        },
        actor: "agent",
      });
      artifactId = artifact.id;
    } catch {
      // Non-fatal: the verified file + URL are still returned.
      artifactId = null;
    }
    return { ok: true, kind: args.kind ?? "cover", artifactId, ...result };
  },
};
