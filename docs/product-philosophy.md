# PolyDocks Product Philosophy

> "Everything is a plugin; the agent is the operator."

---

## 1. Software as an adaptable environment

Most software is a fixed collection of features. You learn its limits and
work around them. PolyDocks treats software as an environment that evolves
around the person using it: the workspace you open on Monday can have
tools in it that did not exist on Friday, because your agent built them
for the week you actually had.

This only works if building is as ordinary as using. In PolyDocks there
is exactly one way to add ability — a plugin behind a typed contract —
whether the author is the core team, a community member, or the agent at
2am solving your problem while you sleep.

## 2. User, agent, workspace, capabilities

Four roles, each with one job:

- **User** — states intent, approves consequential actions, owns the result.
- **Agent (Poly)** — the operator. It reads the workspace, uses
  capabilities, arranges surfaces, and creates tools when nothing fits.
- **Workspace** — the durable part: notes, sources, files, memory,
  installed tools. It outlives every turn and every reload.
- **Capabilities** — the only way anything touches the world. Every
  capability declares its inputs, outputs, and risk; every call is
  validated, logged, and auditable.

The user never configures pipelines. The agent never touches the world
except through capabilities. The workspace never forgets.

## 3. Why the agent should be able to create tools

Because discovery ends where the catalog ends. An agent that can only
*use* tools inherits every blind spot of its makers; an agent that can
*create* tools extends its own reach inside the same safety rules as
everything else. Creation here is not code generation as a party trick:
generated tools are validated against the manifest contract, mounted
into the same dock, versioned, inspectable, and removable. If a built
tool is wrong, you roll it back like any other version — the failure
mode is an ordinary software version, not a hallucination.

## 4. Why the workspace should be extensible

A fixed workspace forces every user into the same shape. An extensible
one compounds: each built tool stays, so next month's work starts from
last month's tools. That compounding is the product — not the individual
plugins, which are small on purpose, but the fact that the environment
remembers what it learned to do for you.

## 5. The microkernel and the plugin ecosystem

The core stays minimal — dock, capability bus, plugin lifecycle/policy,
sandbox bridge — because every line in core is a line every plugin pays
for. No domain logic lives there: Search, Browser, Notes, Sources,
Files, and Sandbox are first-party contract plugins under the exact same
manifest and permission rules as generated ones. The ecosystem this
permits has three layers: core surfaces that ship with the app,
community plugins from a registry, and personal tools your agent built
for you. All three are the same kind of object.

## 6. What this implies

If the environment can be extended by its operator, several familiar
ideas invert. Installation becomes conversation ("build me a tracker"
instead of finding, vetting, and configuring one). The backlog becomes
the agent's working memory rather than a committee's roadmap. And trust
moves from brands to audit trails: you don't trust a tool because of who
shipped it, but because every action it ever took is inspectable and
every version is restorable. That is the long-term bet: software you own
because your agent can change it, not software you rent because only its
makers can.
