/**
 * Demo fixtures: 6 pre-selected real sources. Fully bundled (title, hook,
 * summary markdown included) so the scripted tour runs with zero network
 * and zero model calls. URLs are real and stable; bodies are short
 * original demo summaries, not full articles.
 */
export interface DemoFixtureItem {
  kind: "article" | "paper" | "video";
  title: string;
  site: string;
  url: string;
  hook: string;
  /** Short original summary shown in the reader — no fetch needed. */
  body: string;
  durationSec?: number;
}

export const DEMO_FIXTURES: DemoFixtureItem[] = [
  {
    kind: "article",
    title: "LLM Powered Autonomous Agents",
    site: "lilianweng.github.io",
    url: "https://lilianweng.github.io/posts/2023-06-23-agent/",
    hook: "The classic agent survey: components, planning, memory, tools.",
    body: "# Demo summary\n\nLilian Weng's survey breaks an agent loop into planning, memory, and tool use — the same three pieces PolyDocks wires into every dock plugin.",
  },
  {
    kind: "article",
    title: "Building Effective Agents",
    site: "anthropic.com",
    url: "https://www.anthropic.com/research/building-effective-agents",
    hook: "Anthropic's field guide: workflows first, autonomy where it pays.",
    body: "# Demo summary\n\nAnthropic's guide argues for simple composable patterns — prompt chaining, routing, orchestrator-workers — over fully autonomous agents, with clear advice on when each pattern wins.",
  },
  {
    kind: "paper",
    title: "ReAct: Synergizing Reasoning and Acting in Language Models",
    site: "arxiv.org",
    url: "https://arxiv.org/abs/2210.03629",
    hook: "The reason+act loop behind modern tool-calling agents.",
    body: "# Demo summary\n\nReAct interleaves verbal reasoning traces with actions, letting a model think, call a tool, observe the result, and continue — the loop every Poly tool call follows.",
  },
  {
    kind: "paper",
    title: "Attention Is All You Need",
    site: "arxiv.org",
    url: "https://arxiv.org/abs/1706.03762",
    hook: "The transformer paper everything else builds on.",
    body: "# Demo summary\n\nVaswani et al. replaced recurrence with self-attention, making large-scale parallel training practical — the foundation the whole demo stack stands on.",
  },
  {
    kind: "video",
    title: "How to Get Your First Customers | Startup School",
    site: "YouTube · YC",
    url: "https://www.youtube.com/watch?v=hyYCn_kAngI",
    hook: "Video — plays in the native reader.",
    body: "# Demo summary\n\nY Combinator's Startup School session on getting early customers: do things that don't scale, talk to users, and charge from day one.",
    durationSec: 754,
  },
  {
    kind: "article",
    title: "Software agent",
    site: "wikipedia.org",
    url: "https://en.wikipedia.org/wiki/Software_agent",
    hook: "The encyclopedia definition, for grounding.",
    body: "# Demo summary\n\nWikipedia's overview of software agents: autonomous programs acting on behalf of a user — from thermostat-style reflex agents to goal-based assistants like Poly.",
  },
];

export function youtubeEmbedUrl(watchUrl: string): string | null {
  const m = watchUrl.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
