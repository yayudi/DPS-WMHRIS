---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## graphify

- For codebase/architecture questions when `graphify-out/graph.json` exists, activate the `graphify` skill (`.agents/skills/graphify/SKILL.md`) to query the scoped graph before broad file greps.
- After modifying source code files in a session, run `graphify update .` to keep the graph current.
