# Skill: World and Cities (plan, build, place)

> Selected for knowledge-city and world-map prompts. Explanations stay inline; only explicit build requests touch the map.

## When to use

`plan_map` then `build_city` then `place_city`, in that order, only when the user asks for a city, territory, or map expansion. "Explain X" never plans.

## Tools in order

`plan_map({interests, existingSpec?})` returns a spec: one region per interest with two spec entries (`<Topic> Foundations` L1, `Advanced <Topic>` L3). It creates no workspaces; the loop emits `map.changed`.
`build_city({cityId, topic, depth?})` (`overview|deep|mastery`, default `deep`) runs the pipeline and writes `notes/overview.md`, `feed.json`, `quests/tree.json`, `notes/glossary.json` under `workspace/<cityId>/`.
`place_city({title, regionHint?, near?, x?, y?, mapId?})` (default map `gloom`) pins the point (`map_points`) and emits `map.point.added`. It fails when the city was never built — only announce a placement from the returned point id, never from the request. `list_maps({})` / `set_map({mapId})` only switch styles.

## Naming and existence

City ids are slugs (`city-<topic>-foundations`). Before building, check what exists: `read_city_file({path: "notes/overview.md", cityId})` succeeding means the city is already built; a throw means it is missing. Never build twice, never invent decorative links. To show anything inside a city, `enter_city` first — `open_tab` without the city scope opens the global view and shows nothing from the city.

## Common mistakes

`build_city` before `plan_map`; manual `search_web` loops beside `build_city` (it batches discovery itself); `place_city` before the workspace exists; planning for a general question.

## Example

"Cria uma cidade sobre estoicismo": `plan_map({interests: ["Stoicism"]})`, `build_city({cityId: "city-stoicism-foundations", topic: "Stoicism"})`, `place_city({title: "Stoicism Foundations", regionHint: "Philosophy"})`, then invite entry to the foundational city.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/plan_map.ts, server/agent/tools/build_city.ts,
server/agent/tools/place_city.ts, server/agent/tools/list_maps.ts,
server/agent/tools/set_map.ts, server/city-builder/pipeline.ts,
server/city-builder/stages/persist.ts, server/workspace/schema.sql,
src/features/world/types.ts
-->
