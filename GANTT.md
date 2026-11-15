# bible-mcp — plan and Gantt

A **read-only** MCP server over the Bible Ontology graph, rebuilt as **Next.js + xmcp** (TypeScript),
serving the same six tools as `app2/mcp.py` + `app2/mcp_backend.py`. The data the server reads is
exported once from the ontology into `ontology-data/`.

## Critical path (one at a time)

| # | Milestone | Depends on | Est. | Status |
|---|-----------|-----------|------|--------|
| M1 | Scaffold Next.js + xmcp (`/mcp` route, config, tsconfig, app shell) | — | 15m | **done** |
| M2 | Export ontology data → `ontology-data/` (Python, using the site's own functions) | M1 | 45m | **done** |
| M3 | Data layer + MCP tool logic in TypeScript (6 tools, resources, cursors, budget) | M2 | 90m | **done** |
| M4 | Build, run, smoke-test every tool against the Python reference | M3 | 30m | **done** — 21/22 answers identical |

## Parallel / non-critical tracks

| # | Track | Runs alongside |
|---|-------|----------------|
| P1 | Home page (`/`) and server identity/instructions | M1–M4 — **done** |
| P2 | README, licensing/attribution notes, `.gitignore` | M2–M4 — **done** |
| P3 | `scripts/verify.mjs` smoke tests + sample `curl` requests | M3–M4 — **done** |
| P4 | MongoDB + Mongoose store, seeded from the JSON snapshot | M4 — **done** |

## Gantt

```
             M1        M2             M3                M4
             ├─────────┼──────────────┼─────────────────┼───────▶
Scaffold     ████████
Export data            ████████████████
MCP layer                              ████████████████████████
Verify                                                    ███████████
P1 home      ████████  ████
P2 docs                ████████████████  ████████████████
P3 tests                                ████████████  ███████████
```

Rule: **M1 → M2 → M3 → M4 strictly in order**; P1–P3 may proceed in parallel and never block the path.

## What "faithful" means here

- The **hop rules** of `mcp_backend.py` are ported line for line: a hop is a relation with a verse,
  strength ordering with `_diversify`, the card's category order, readings marked `reading`, word
  matches marked `match`, two original-language words at most, themes in the body and never as hops.
- The **protocol shaping** of `mcp.py` is ported: `start`, `search`, `fetch`, `get_relations`
  (cursor paging), `get_verse`, `get_word`; links carry `iri`, `certainty`, `voice`, `definition`;
  `moves`, `map`, `next_cursor`, the 60,000-byte budget, and the four resources.
- xmcp owns the transport and the JSON-RPC lifecycle; the tool payloads keep the reference's shape
  (`content[0].text` = the structured JSON, then one `resource_link` per link, `structuredContent`).
- Data is **read-only**: the export is a snapshot; nothing at run time fetches or writes the graph.
