# Skill: Verify and Report (prove done, never claim it)

> Selected for check/verify/done prompts, and it governs every turn that calls tools.

## Protocol

Read back state before saying "done": `list_tabs`, `inspect_experience`, `read_city_file`, or the tool result itself. Report failures as failures with the error text and the next step; never claim success without a post-condition. Never repeat the previous answer when nothing changed. If the same tool with the same arguments already ran this turn, stop and change approach: the loop refuses the duplicate.

## Turn pattern

Act, read back, then report exactly what the result contains (ids, versions, titles from the result, not from the request). Theme-style confirms restate only applied values; research reports cite real fetched URLs; builds name the created ids.

## Common mistakes

"Done" with no read-back; pasting internal ids, logs, or empty scaffolding unasked; retrying identical calls; substituting a different image, source, or tool when the requested one errored.

## Example

After `modify_plugin` returns `{success: true, version: "1.0.1"}`, call `inspect_experience({id})`, confirm `isHealthy`, and reply with the version. If it returns an error, report the error and stop.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/loop.ts, server/agent/tools/inspect_experience.ts,
server/agent/tools/list_tabs.ts, server/agent/tools/inspect_tab.ts,
server/agent/tools/list_recent_executions.ts
-->
