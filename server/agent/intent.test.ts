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
    // Restyle requests mention theme words but target an artifact: they must
    // route to plugin_update, never to theme (which would strip the plugin
    // tools and stall the loop). Regression for the Bitcoin Pricing View freeze.
    {
      prompt:
        "Melhora a UI/UX do plugin Bitcoin Pricing View. Ele não se adapta ao tema e fica ruim com o fundo. Refaz usando os componentes shadcn do app e o design system, para ficar mais bonito.",
      expected: "plugin_update",
    },
    { prompt: "melhora o plugin pomodoro, deixa mais bonito", expected: "plugin_update" },
    { prompt: "refaz a dashboard usando shadcn e o design system", expected: "plugin_update" },
    { prompt: "fix the reader background, it renders badly", expected: "plugin_fix" },
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

  it("plugin_fix denies recreate tools", () => {
    expect(INTENT_TOOL_DENYLIST.plugin_fix).toContain("create_plugin");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).not.toContain("modify_plugin");
    expect(INTENT_TOOL_DENYLIST.plugin_fix).not.toContain("inspect_experience");
  });
});
