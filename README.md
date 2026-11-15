# bible-mcp

A **read-only** MCP server over the Bible Ontology graph, rebuilt as **Next.js + xmcp**
(TypeScript) from `app2/mcp.py` and `app2/mcp_backend.py`.

The graph holds the people, events, places, ideas and words of the Bible, and every
relation cites the verse it rests on. The server takes no doctrinal position: where a
link is a reading rather than a statement of the text, it says so.

- MCP endpoint: `POST /mcp` (Streamable HTTP), served by the Next.js route in `src/app/mcp/route.ts`.
- Home page: `/`.
- Tools: `start`, `search`, `fetch`, `get_relations`, `get_verse`, `get_word`.
- Resources: `bibleontology://about`, `method`, `licensing`, `version`.
- Data: a snapshot in `ontology-data/` (plain JSON), also seedable into MongoDB.
- **Production:** <https://bible.ontology.jesus.technology/mcp> (custom domain)
  and <https://bible-mcp-alpha.vercel.app/mcp> — Vercel project
  `wonglok/bible-mcp`.
  Vercel serves the JSON snapshot shipped with the `/mcp` function
  (`outputFileTracingIncludes` in `next.config.ts`); a local MongoDB is not
  reachable from there.

## Quick start

```bash
npm install
npm run build       # xmcp build, then next build
npm start           # http://localhost:3000/mcp
```

For development:

```bash
npm run dev         # xmcp dev + next dev
```

Try it:

```bash
curl -s http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"fetch","arguments":{"id":"card:david"}}}'
```

## Data snapshot

`ontology-data/` is produced once from the bibleontology-main checkout by the site's own
functions, then served read-only by TypeScript. Nothing at run time writes or fetches the
graph.

```bash
# from loklok/bible-mcp, with app2/ and src/ one level up:
python3 scripts/export-ontology-data.py --out ontology-data
```

| File | What it holds |
| --- | --- |
| `entities.json` | each card's groups and rows as the hop rules read them, event casts and quotations, major themes |
| `verses.json` | the Berean text of every verse, including the later-manuscripts note |
| `verse-links.json` | each verse's editors' notes, echoes, judged pairs and allusions, targets already resolved |
| `words.json` | each Strong's word card's lemma, gloss, definition and occurrence refs |
| `themes.json`, `questions.json` | the major themes and the shown question cards |
| `schema.json` | the published relation vocabulary, the kinds, and the schema-as-items |
| `search.json` | the names, akas, books and theme concepts the search ranks |
| `card-slugs.json` | the name-made public addresses (`/e/rahab_job_26_12`) |
| `meta.json` | data and vocabulary version, sources, credit |

The export uses the reference implementation as the oracle (it imports `app2/server.py`),
so the site's grouping, hop inputs and word fields are exactly its own. Files are plain
JSON; no `.gz` files are read or written.

`export-ontology-data.py` and `reference-diff.py` read the site from the parent
`bibleontology-main` checkout (`app2/`, `src/`, `ontology/`, `out/`). The committed
`ontology-data/` snapshot is enough to run and verify the server; regenerating it needs
that checkout.

## MongoDB (optional)

MongoDB Community is installed on this machine (`/opt/homebrew/bin/mongod`) and Mongoose
is a project dependency. The JSON files stay the default; to store and read the snapshot
from MongoDB instead:

```bash
# seed from ontology-data/*.json into bible_mcp
npm run seed

BIBLE_MCP_STORE=mongodb \
MONGODB_URI=mongodb://127.0.0.1:27017/bible_mcp \
npm start
```

Collections: `snapshot` (meta, addresses, schema, search), `entities`, `verses`,
`verse_links`, `words`, `themes`, `questions`. `src/lib/mongo.ts` loads them once into
memory, so every answer is still a lookup. See `.env.example`.

## Verification

```bash
npm start            # one terminal
npm run verify       # smoke-test every tool, cursor, error path and resource
npm run diff         # compare 22 answers with app2/mcp.py, field by field

# the same checks against the deployment
MCP_URL=https://bible.ontology.jesus.technology/mcp npm run verify
MCP_URL=https://bible.ontology.jesus.technology/mcp npm run diff
```

`scripts/reference-diff.py` loads the site's own data and MCP core and diffs the
`structuredContent` of both servers. **21 of 22 answers are identical.** The remaining
one (`card:event_creation_of_heavens_and_earth`) differs only in the order of two cast
rows in a tie; the Python reference itself returns a different order across its own
processes (string hash randomisation), so no snapshot can match all runs.

## How faithful it is

- **Hop rules** (`mcp_backend.py`) are ported: a hop is a relation that hands over its
  verse; strength ordering with `_diversify`; the card's category order; readings marked
  `reading`; word matches marked `match`; two original-language words at most; themes in
  the body and never as hops.
- **Protocol shaping** (`mcp.py`) is ported: links carry `iri`, `certainty`, `voice` and
  `definition`; `moves`, `map`, `next_cursor`, the 60,000-byte budget; `content[0]` is
  the structured JSON and every link is also a `resource_link`.
- xmcp owns the transport, `initialize`, `tools/list` and `resources/*`; server identity
  and instructions live in `xmcp.config.ts`.
- Search ranks names, akas, major themes, passages and phrases like the site's own
  ranking, including "a part after its whole". The extra small doors the site adds
  (Strong's rows, word-behind-English rows, loose word matches) are not ported.

## Layout

```
src/app/mcp/route.ts     the xmcp handler (GET + POST)
src/app/page.tsx         the home page
src/tools/*.ts           one file per tool
src/resources/…          the four bibleontology:// resources
src/lib/data.ts          loads the snapshot (JSON, or MongoDB)
src/lib/backend.ts       the hop rules and search (port of mcp_backend.py)
src/lib/mcp.ts           links, moves, map, cursors, budget, tool payloads (port of mcp.py)
src/lib/mongo.ts         optional MongoDB store
scripts/export-ontology-data.py   builds ontology-data from the site
scripts/seed-mongo.mjs            loads the JSON snapshot into MongoDB
scripts/verify.mjs                end-to-end smoke test
scripts/reference-diff.py         parity diff against app2/mcp.py
GANTT.md                          plan and critical path
```

## Licensing

Two licences, by kind of work — see [LICENSING.md](LICENSING.md):

- **The code** is Apache License 2.0 ([LICENSE](LICENSE)).
- **The `ontology-data/` snapshot** is CC BY 4.0 ([LICENSE-DATA](LICENSE-DATA)).

The graph: **Bible Ontology (bibleontology.org), CC BY 4.0.** Its sources keep their own
terms and are credited in every answer's `sources`:

- MACULA Hebrew and Greek Linguistic Datasets — © 2022–2024 Biblica, Inc., CC BY 4.0.
- The Holy Bible, Berean Standard Bible — public domain.
- STEP Bible's Translators Brief lexicons (Tyndale House, Cambridge) — CC BY 4.0.
- A word's senses from the UBS dictionaries (where present) are CC BY-SA 4.0, not the
  graph's licence; an answer carrying them says so and credits them in `sources`.

This server is read-only and states no doctrinal position.
