# Polymax model: an agent and its dock

A plugin is an experience that lives in your dock. Four verbs, shared by
the dock and the agent:

- **Open**: the experience takes the screen or opens next to the chat.
- **Close**: it leaves the view, but its state is kept.
- **Edit**: you or the agent change it — a new version, with rollback.
- **Pin**: it stays fixed (pin) and comes back as it was.

Everything else follows from this:

- A city is an experience that, when opened, shows other experiences
  (Sources, Notes, Quests).
- The map is an experience that opens cities.
- XP and streak are a small experience on the status line.
- The agent creates a new tool, and it appears in the dock like any other.

## Minimal manifest

Less than proposed: `id`, `version`, `surface` (what it opens),
`capabilities` (what the agent may operate) and `permissions`.
Composition is not its own concept — it is just an experience asking
the dock to open others.

```json
{
  "id": "pomodoro-focus",
  "version": "1.0.1",
  "surface": { "id": "pomodoro-focus", "title": "Pomodoro Focus", "icon": "Clock" },
  "capabilities": [{ "id": "timer.start", "description": "Start a focus session", "risk": "write" }],
  "permissions": [{ "type": "storage", "scope": "plugin" }]
}
```

## Examples

**A simple agent-created experience.** Prompt: "a haiku about the sea".
The agent opens what exists first; finding nothing, it creates
`sea-haiku` (one file, tokens only), mounts it, and opens it in the dock.
Same verbs as everything else: close keeps it, edit versions it.

**A city as an experience.** Opening `stoicism` shows Sources, Notes,
Quests — each an experience with the same four verbs. The map opens
cities; the city opens experiences. One recursion, no special cases.

## Direction (not requirements)

Slots (home/tray/status/background), formal scopes, and packages stay
as direction. The four verbs and the manifest above are the contract;
everything else is a consequence.
