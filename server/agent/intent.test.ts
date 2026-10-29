import { describe, expect, it } from "bun:test";
import { classifyIntent, INTENT_TOOL_DENYLIST } from "./intent";

describe("Intent routing: update/fix classifier (PT+EN)", () => {
  const table: Array<{ prompt: string; expected: ReturnType<typeof classifyIntent> }> = [
    // The three reader utterances from the investigation: all must route to fix.
    { prompt: "fix the reader", expected: "plugin_fix" },
    { prompt: "arruma o reader", expected: "plugin_fix" },
    { prompt: "open in reader doesn't work", expected: "plugin_fix" },
    // PT+EN side-by-side pairs.
    { prompt: "the reader is broken", expected: "plugin_fix" },
    { prompt: "o leitor está quebrado", expected: "plugin_fix" },
    { prompt: "there is a bug in my feed plugin", expected: "plugin_fix" },
    { prompt: "tem um bug no meu plugin de feed", expected: "plugin_fix" },
    { prompt: "resolve the timer issue", expected: "plugin_fix" },
    { prompt: "resolve o problema do timer", expected: "plugin_fix" },
    { prompt: "update my pomodoro plugin", expected: "plugin_update" },
    { prompt: "atualiza meu plugin pomodoro", expected: "plugin_update" },
    { prompt: "change the dashboard layout", expected: "plugin_update" },
    { prompt: "muda o layout da dashboard", expected: "plugin_update" },
    { prompt: "add a streak counter to my timer tool", expected: "plugin_update" },
    { prompt: "adiciona um contador de streak na minha ferramenta", expected: "plugin_update" },
    // Non-artifact prompts stay out of the plugin lanes.
    { prompt: "what is quantum computing?", expected: "general" },
    { prompt: "o que é computação quântica?", expected: "general" },
    { prompt: "fix the meeting notes", expected: "general" },
  ];

  for (const { prompt, expected } of table) {
    it(`"${prompt}" -> ${expected}`, () => {
      expect(classifyIntent(prompt)).toBe(expected);
    });
  }

  it("plugin_fix denies recreate/delete tools", () => {
    expect(INTENT_TOOL_DENYLIST.plugin_fix).toContain("create_tab");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).toContain("create_plugin");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).toContain("delete_tab");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).not.toContain("modify_plugin");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).not.toContain("inspect_experience");
  });
});
