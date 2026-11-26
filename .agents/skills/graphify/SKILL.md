---
name: graphify
description: Turn any folder of files into a navigable knowledge graph and keep graphify-out updated after code changes.
---

# Graphify Knowledge Graph Skill

Use this workflow to query or update the repository knowledge graph (`graphify-out/graph.json`):

1. **Querying Architecture & Relationships (Scoped Subgraph First):**
   - **Questions / Concepts:** Run `graphify query "<question>"` / `graphify explain "<concept>"` (CLI) or `query_graph` / `get_node` / `get_neighbors` / `god_nodes` (MCP).
   - **Path / Coupling:** Run `graphify path "<A>" "<B>"` (CLI) or `shortest_path` (MCP).
   - **Fallback Order:** Navigate `graphify-out/wiki/index.md` if present; read `graphify-out/GRAPH_REPORT.md` only for broad architecture review when scoped queries do not surface enough context.
2. **Updating the Graph After Code Changes:**
   - Run `graphify update .` (AST-only, zero API cost) from workspace root whenever Go, Python, or frontend source files are added or modified.
