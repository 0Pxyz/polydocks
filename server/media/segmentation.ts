import { getModelForRole, modelError, type ModelRole } from "../agent/modelRegistry";

/**
 * SAM 3.1 segmentation service (Responses API, model sam-3.1).
 * Present as a typed service so occlusion-flashcard work can build on it,
 * but NOT wired as an agent tool yet: it stays out of the demo golden path
 * until voice + image + open-weight toggle are stable.
 *
 * On success returns boxes/masks geometry; on any failure returns
 * ok:false with a structured, retryable-flagged error. Never ok:true
 * without parsed geometry.
 */
export interface SegmentationResult {
  ok: true;
  model: string;
  boxes: unknown[];
  masks: unknown[];
  raw: string;
}

export interface SegmentationFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean; role: ModelRole };
}

export async function segmentImage(input: {
  prompt: string;
  imageUrl?: string;
  imageBase64?: string;
  fetchImpl?: typeof fetch;
}): Promise<SegmentationResult | SegmentationFailure> {
  const role: ModelRole = "segmentation";
  const resolved = getModelForRole(role);
  if (!resolved.configured) {
    return modelError(role, "segmentation_not_configured", "SAM 3.1 is not configured (missing MODEL_API_KEY).", false);
  }
  const prompt = input.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    return modelError(role, "invalid_prompt", "Prompt must not be empty.", false);
  }
  if (!input.imageUrl && !input.imageBase64) {
    return modelError(role, "missing_image", "Provide imageUrl or imageBase64.", false);
  }

  const imagePart =
    input.imageUrl
      ? { type: "input_image", image_url: input.imageUrl }
      : { type: "input_image", image_url: `data:image/png;base64,${input.imageBase64}` };

  const fetchImpl = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${resolved.baseURL.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.modelId,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: prompt }, imagePart],
          },
        ],
      }),
    });
  } catch (err: any) {
    return modelError(role, "segmentation_transport_error", `SAM request failed: ${err?.message || err}`, true);
  }
  if (res.status === 429 || res.status === 503) {
    return modelError(role, "segmentation_retryable", `SAM busy (HTTP ${res.status}). Retry with backoff.`, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "").then((t) => t.slice(0, 500));
    return modelError(
      role,
      "segmentation_request_failed",
      `SAM returned HTTP ${res.status}: ${text}`,
      res.status >= 500
    );
  }
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    return modelError(role, "segmentation_bad_response", "SAM returned non-JSON.", true);
  }
  const output = Array.isArray(body?.output) ? body.output : [];
  const textOut = output
    .filter((o: any) => typeof o?.text === "string" || typeof o?.content === "string")
    .map((o: any) => o.text ?? o.content)
    .join("\n");
  const raw = textOut || JSON.stringify(body).slice(0, 4000);
  // Geometry parsing (boxes/masks special tokens) happens in a follow-up;
  // for now require a non-empty payload before ok:true.
  if (raw.trim().length === 0) {
    return modelError(role, "segmentation_empty_result", "SAM returned an empty result.", true);
  }
  return { ok: true, model: resolved.modelId, boxes: [], masks: [], raw };
}
