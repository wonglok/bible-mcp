#!/usr/bin/env node
/**
 * Smoke-test the running server: every tool, the resources, cursors, the error
 * path, and the shapes app2/mcp.py promises.
 *
 *   npm start            # in one terminal
 *   npm run verify       # in another
 *
 * MCP_URL overrides the endpoint (default http://127.0.0.1:3000/mcp).
 */
const BASE = process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp";

let nextId = 1;
const failures = [];

function check(ok, what, detail) {
  if (ok) {
    console.log(`  ok   ${what}`);
  } else {
    failures.push(what);
    console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ""}`);
  }
}

async function rpc(method, params = {}) {
  const id = nextId++;
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  const payloads = [];
  for (const block of text.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        payloads.push(JSON.parse(line.slice(6)));
      } catch {
        /* not JSON */
      }
    }
  }
  if (!payloads.length) {
    try {
      payloads.push(JSON.parse(text));
    } catch {
      throw new Error(`no JSON in response (${res.status}): ${text.slice(0, 200)}`);
    }
  }
  return payloads.find((p) => p.id === id) ?? payloads[payloads.length - 1];
}

async function call(name, args = {}) {
  const msg = await rpc("tools/call", { name, arguments: args });
  return msg.result;
}

const textOf = (result) => result?.content?.find((c) => c.type === "text")?.text;
const structuredOf = (result) => result?.structuredContent ?? JSON.parse(textOf(result));

async function main() {
  console.log(`bible-mcp at ${BASE}\n`);

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "verify", version: "1" },
  });
  check(init.result?.serverInfo?.name === "bible-ontology", "initialize: server name");
  check((init.result?.instructions ?? "").includes("start tool"), "initialize: instructions");

  const listed = await rpc("tools/list");
  const names = (listed.result?.tools ?? []).map((t) => t.name).sort();
  check(
    JSON.stringify(names) ===
      JSON.stringify(["fetch", "get_relations", "get_verse", "get_word", "search", "start"]),
    "tools/list: exactly the six tools",
    names.join(","),
  );
  check(
    (listed.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true),
    "tools/list: every tool is readOnly",
  );

  const start = structuredOf(await call("start"));
  check(Array.isArray(start.links) && start.links.length > 0, "start: links");
  check(!!start.sources?.length && !!start.credit && !!start.data_version, "start: sources, credit, version");

  const search = structuredOf(await call("search", { query: "David" }));
  check(Array.isArray(search.results) && search.results.length > 0, "search: results");
  check(search.results?.[0]?.id === "card:david", "search: David leads with the card", search.results?.[0]?.id);
  check(Array.isArray(search.results?.[0]?.links), "search: first hit carries links");

  const david = await call("fetch", { id: "card:david" });
  const d = structuredOf(david);
  check(d.id === "card:david" && d.title === "David", "fetch: card:david");
  check((d.verses ?? []).length > 0 && typeof d.verses[0].text === "string", "fetch: card verses carry text");
  check((d.links ?? []).length > 0, "fetch: links");
  check(
    (d.links ?? []).filter((l) => l.rel !== "more").every((l) => "iri" in l && "certainty" in l && "because" in l),
    "fetch: every link carries iri, certainty, because",
  );
  const eventCard = structuredOf(await call("fetch", { id: "card:event_jesus_temptation" }));
  check((eventCard.moves ?? []).some((m) => m.rel === "down"), "fetch: an event card moves down to its tellings");
  check((d.map ?? []).length > 0 && d.map[0].get?.tool === "get_relations", "fetch: map points at get_relations");
  check(
    (david.content ?? []).some((c) => c.type === "resource_link"),
    "fetch: content carries resource_link items",
  );

  const verse1 = structuredOf(await call("get_verse", { ref: "Matt 4:4" }));
  const verse2 = structuredOf(await call("get_verse", { ref: "Matt.4.4" }));
  check(verse1.id === "verse:Matt.4.4", "get_verse: Matt 4:4");
  check(verse2.id === verse1.id, "get_verse: both spellings agree");
  check((verse1.text ?? "").length > 0, "get_verse: text");
  check((verse1.moves ?? []).some((m) => m.rel === "next"), "get_verse: next move");

  const word = structuredOf(await call("get_word", { strong: "H8322" }));
  check(word.id === "word:H8322", "get_word: H8322");
  check((word.text ?? "").includes("("), "get_word: lemma and transliteration");
  check((word.verses ?? []).length > 0, "get_word: example verses");

  const greek = structuredOf(await call("get_word", { strong: "G26" }));
  check(greek.id === "word:G26" && (greek.text ?? "").includes("ἀγάπη"), "get_word: G26 is ἀγάπη");

  const rels1 = structuredOf(await call("get_relations", { id: "card:david" }));
  check(Array.isArray(rels1.relations) && rels1.relations.length <= 25, "get_relations: page of at most 25");
  check(typeof rels1.next_cursor === "string", "get_relations: next_cursor");
  const rels2 = structuredOf(
    await call("get_relations", { id: "card:david", cursor: rels1.next_cursor }),
  );
  const ids1 = new Set(rels1.relations.map((r) => r.id + "|" + r.rel));
  check(
    rels2.relations.every((r) => !ids1.has(r.id + "|" + r.rel)),
    "get_relations: the second page does not repeat the first",
  );

  const bad = await call("fetch", { id: "card:does_not_exist" });
  check(bad?.isError === true, "fetch: a missing item is an error result");

  const resList = await rpc("resources/list");
  const uris = (resList.result?.resources ?? []).map((r) => r.uri);
  check(
    ["about", "method", "licensing", "version"].every((n) => uris.includes(`bibleontology://${n}`)),
    "resources/list: the four resources",
    uris.join(","),
  );

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
