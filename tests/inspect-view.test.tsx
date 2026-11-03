import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { InspectView } from "../src/features/inspect/InspectView";
import { useConversationStore } from "../src/lib/agent/conversationStore";

/** Inspect view smoke tests (#181): honest empty states, no secrets. */
describe("inspect view (#181)", () => {
  it("shows the no-session empty state before any runtime exists", () => {
    useConversationStore.setState({ orchestratorSessionId: null } as any);
    const html = renderToString(<InspectView />);
    expect(html).toContain("No runtime session yet");
    expect(html).toContain("Inspect");
  });
});
