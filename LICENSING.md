# Terms

**Two licences, by kind of work.** Credit for either: *Bible Ontology by Doug
Egge (bibleontology.org)*.

- **The code in this repository** — `src/`, `scripts/`, `xmcp.config.ts`,
  `next.config.ts` and the other configuration — is under the
  [Apache License, Version 2.0](LICENSE). It is a TypeScript port of
  `app2/mcp.py` and `app2/mcp_backend.py` from the Bible Ontology project,
  with the same terms.
- **The data snapshot** in `ontology-data/` is under
  [Creative Commons Attribution 4.0 International](LICENSE-DATA) (CC BY 4.0).
  It is exported from the Bible Ontology graph by
  `scripts/export-ontology-data.py`, which reads the graph and writes a
  read-only snapshot of what the site's own functions answer.
- **The texts and data this project draws on** keep their own terms, which no
  file here changes: see [NOTICE](NOTICE) for the notices that travel with
  every copy, and [SOURCES.md](SOURCES.md) for the full account.

## What travels with it

- `LICENSE` — Apache License, Version 2.0 (the code).
- `LICENSE-DATA` — CC BY 4.0 (the graph snapshot).
- `NOTICE` — the notices that must travel with every copy, including the
  original-language datasets and the Berean text.
- `SOURCES.md` — each source's terms in its own words.
- `CITATION.cff` — how to cite the graph.

## In every answer

The server is read-only and states no doctrinal position. Every tool answer
carries its `sources` and the credit line:

> Bible Ontology (bibleontology.org), CC BY 4.0

A word answer that carries senses from the UBS dictionaries says so in its
text (CC BY-SA 4.0, not the graph's licence) and adds that source to its
`sources`.
