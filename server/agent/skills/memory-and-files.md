# Skill: Memory and Files (agent home)

> Selected for remember/recall and file prompts. One home, one tool family.

## The home

Agent home is the agent's own disk: `list_files`, `read_file`, `write_file`, `edit_file`, `search_files` (paths relative to `agent-home/`, reads capped at ~50KB with offset/limit pagination).

## Tools in order

Recall: `recall_memory({query, category?, maxTokens?})` before answering from memory. Record: `record_memory({content, category?, durable?, workspaceId?})` with category `user_preference`, `architectural_rule`, `project_insight`, `tool_usage`, or `general`. Files: list, then read (paginated), then `edit_file({path, target, replacement})` for surgical changes (`target` must match uniquely) or `write_file({path, content, overwrite?})` for new files.

## Common mistakes

`edit_file` with a non-unique target; dumping memory or file listings into replies unasked.

## Example

"Remember my goal": `record_memory({content: "Master Stoicism", category: "user_preference"})`, reply in one line. "Save this note": `write_file({path: "notes/stoicism.md", content})`, never anything else.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/list_files.ts, server/agent/tools/read_file.ts,
server/agent/tools/write_file.ts, server/agent/tools/edit_file.ts,
server/agent/tools/search_files.ts, server/agent/tools/recall_memory.ts,
server/agent/tools/record_memory.ts,
server/system/filesystem.ts, server/agent/memory.ts
-->
