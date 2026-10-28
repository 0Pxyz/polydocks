# Skill: Knowledge Territories & World Map Planning (plan_map & build_city)

> **Skill Identifier:** `world-planning`  
> **Source Target:** `server/agent/skills/world-planning.md`

---

## 1. When to Use This Skill

Activate this skill ONLY when:
1. The user explicitly requests to create a Knowledge City, build a city, or construct a learning environment (e.g. "*Create a Knowledge City to learn neural networks from scratch*", "*build city for transformers*").
2. The user explicitly asks to create or expand a knowledge area, territory, or domain (e.g. "*criar uma nova área de conhecimento*", "*create a new knowledge domain for distributed systems*").
3. The user explicitly asks to expand or plan the world map with new territories or cities (e.g. "*expand the world map*").

Do NOT activate this skill for general conceptual questions, explanations, or general learning queries (e.g. "*Explain how transformers work*", "*What is quantum computing?*"). For general questions, answer directly in natural language without planning a map or constructing a city.

---

## 2. High-Efficiency Planning Protocol

To establish a new knowledge territory swiftly without exhausting tool steps:

### Step 1: Chart the Territory (`plan_map`)
Call `plan_map({ interests: ["<Topic Name>"] })`.
- This establishes the semantic region and generates two progression cities (e.g. `[Topic] Foundations` (level 1) and `Advanced [Topic]` (level 3)).
- The world map immediately receives the new region and coordinates.

### Step 2: Construct the Workspace (`build_city`)
Call `build_city({ cityId: "<city-slug-foundations>", topic: "<Topic Name>", depth: "deep" })`.
- This executes the 6-stage autonomous pipeline in one call: queries TinyFish for verified primary sources, generates conceptual summaries, writes overview notes to `workspace/<city>/`, and structures progressive mastery quests.
- Do NOT make separate manual loops of `search_web` and `fetch_page` when `build_city` is available—it batches and caches discovery automatically.

### Step 3: Conclude with Pedagogical Summary
Conclude the turn immediately after tools complete:
1. Announce the newly charted region and cities on the map.
2. Summarize key foundational paradigms and primary sources discovered.
3. Invite the user to enter the foundational city from the map to begin their first quest.
