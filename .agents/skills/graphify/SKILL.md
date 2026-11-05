---
name: graphify
description: Turn any folder of files into a navigable knowledge graph and keep graphify-out updated after code changes.
---

# Graphify Knowledge Graph Skill

Follow the graphify workflow to query or update the repository knowledge graph (`graphify-out/graph.json`):

1. **Querying Architecture / Relationships:**
   - Prefer calling the `graphify` MCP tools (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `god_nodes`) before running broad file greps.
2. **Updating the Graph After Code Changes:**
   - Run `graphify update .` (AST-only, zero API cost) whenever Go, Python, or frontend source files are added or modified.
   - If no path argument is given, use `.` (current workspace root).

