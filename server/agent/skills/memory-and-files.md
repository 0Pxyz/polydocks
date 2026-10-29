# Skill: Memory and Files (agent home vs city)

> Selected for remember/recall and file prompts. Two homes, two tool families; never mix them.

## The two homes

Agent home is the agent's own disk: `list_files`, `read_file`, `write_file`, `edit_file`, `search_files` (paths relative to `agent-home/`, reads capped at ~50KB with offset/limit pagination). A city workspace is the user's learning folder: `read_city_file`, `write_city_file` (a `cityId` scope, notes-style paths). `get_city_context({cityId?})` reads city state only for explicit asks.

## Tools in order

Recall: `recall_memory({query, category?, maxTokens?})` before answering from memory. Record: `record_memory({content, category?, durable?, workspaceId?})` with category `user_preference`, `architectural_rule`, `project_insight`, `tool_usage`, or `general`. Files: list, then read (paginated), then `edit_file({path, target, replacement})` for surgical changes (`target` must match uniquely) or `write_file({path, content, overwrite?})` for new files. City notes always go through `write_city_file`.

## Common mistakes

`write_file` for city notes (wrong home); `read_city_file` for agent files; `edit_file` with a non-unique target; dumping memory or file listings into replies unasked; `get_city_context` on greetings.

## Example

"Remember my goal": `record_memory({content: "Master Stoicism via living concept cities", category: "user_preference"})`, reply in one line. "Save this as a city note": `write_city_file({path: "notes/stoicism.md", content, cityId})`, never `write_file`.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/list_files.ts, server/agent/tools/read_file.ts,
server/agent/tools/write_file.ts, server/agent/tools/edit_file.ts,
server/agent/tools/search_files.ts, server/agent/tools/recall_memory.ts,
server/agent/tools/record_memory.ts, server/agent/tools/get_city_context.ts,
server/agent/tools/read_city_file.ts, server/agent/tools/write_city_file.ts,
server/system/filesystem.ts, server/agent/memory.ts
-->
