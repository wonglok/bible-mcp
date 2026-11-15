/**
 * The protocol shaping of app2/mcp.py, ported: links, moves, the map, cursors,
 * the byte budget, and the six tools' payloads. xmcp owns the transport and the
 * JSON-RPC lifecycle; what is here is the shape every answer keeps.
 */
import type { Backend, McpItem, Move, Rel } from "./backend";
import { CREDIT } from "./text";

export const MAX_LINKS = 12;
export const MAX_RELATIONS = 25;
export const MAX_BYTES = 60000;
export const MAX_QUERY = 200;
export const NS = "https://bibleontology.org/ns/relation/";

export type LinkLike = {
  rel?: string | null;
  id?: string | null;
  title?: string | null;
  url?: string | null;
  cursor?: string;
};

export type ToolResult = {
  content: (
    | { type: "text"; text: string }
    | { type: "resource_link"; uri: string; name: string; description: string }
  )[];
  structuredContent: Record<string, unknown>;
};

export class ToolError extends Error {}

const BOOKS = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth",
  "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
  "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam",
  "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah",
  "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John",
  "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess",
  "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet",
  "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];
const BOOK_PAT = [...BOOKS].sort((a, b) => b.length - a.length).join("|");
const SLUG = "[a-z0-9_]{1,80}";
const RE_CARD = new RegExp("^card:" + SLUG + "$");
const RE_THEME = new RegExp("^theme:" + SLUG + "$");
const RE_QUESTION = /^question:[a-z0-9](?:[a-z0-9_]|-(?!-)){0,79}$/;
const RE_VERSE = new RegExp(`^verse:(?:${BOOK_PAT})\\.(\\d{1,3})\\.(\\d{1,3})$`);
const RE_WORD = /^word:[HG]\d{1,4}[a-z]?$/;
const RE_RELATION = /^relation:[a-z0-9_]{1,80}$/;
const RE_KIND = /^kind:[a-z0-9_]{1,40}$/;
const RE_REF = new RegExp(`^(${BOOK_PAT})\\s*[.: ]\\s*(\\d{1,3})\\s*[.:]\\s*(\\d{1,3})$`);
const RE_STRONG = /^[HG]\d{1,4}[a-z]?$/;

const _ERROR_MESSAGES: Record<number, string> = {
  "-32600": "invalid request",
  "-32601": "method not found",
  "-32602": "invalid params",
  "-32603": "internal error",
};

export function validId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (
    RE_CARD.test(value) ||
    RE_THEME.test(value) ||
    RE_QUESTION.test(value) ||
    RE_WORD.test(value) ||
    RE_RELATION.test(value) ||
    RE_KIND.test(value)
  ) {
    return true;
  }
  const m = RE_VERSE.exec(value);
  if (!m) return false;
  return m.slice(1).every((n) => {
    const x = Number(n);
    return x >= 1 && x <= 999;
  });
}

export function relationType(relation: Rel): string | null {
  // The vocabulary type defines the relation; the label is only for people.
  const rtype = relation.type;
  if (typeof rtype === "string" && rtype) return rtype;
  const label = relation.rel;
  return typeof label === "string" && label ? label : null;
}

function vocabType(relation: Rel): string | null {
  const rtype = relation.type;
  return typeof rtype === "string" && /^[a-z0-9_]+$/.test(rtype) ? rtype : null;
}

export function relationView(relation: Rel) {
  const vtype = vocabType(relation);
  return {
    rel: relation.rel,
    id: relation.id,
    title: relation.title,
    url: relation.url,
    because: relation.because ?? {},
    iri: vtype ? NS + vtype : null,
    certainty: relation.certainty,
    voice: relation.voice,
    // the relation's own item, so an agent can read what the link claims before relying on it
    definition: vtype ? "relation:" + vtype : null,
  };
}

export function makeCursor(itemId: string, offset: number, kind?: string | null): string {
  const payload: Record<string, unknown> = { id: itemId, offset };
  if (kind) payload.kind = kind;
  // Python's urlsafe_b64encode keeps the "=" padding; match it byte for byte.
  let out = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  while (out.length % 4) out += "=";
  return out;
}

export function readCursor(cursor: unknown): { id: string; offset: number; kind?: string } | null {
  if (typeof cursor !== "string") return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== "string" || !validId(p.id)) return null;
  if (typeof p.offset !== "number" || !Number.isInteger(p.offset) || p.offset < 0 || p.offset > 100000)
    return null;
  if (p.kind !== undefined && p.kind !== null && typeof p.kind !== "string") return null;
  return p as { id: string; offset: number; kind?: string };
}

export function shownRelations(backend: Backend, item: McpItem, kind?: string | null): Rel[] {
  const relations = [...(item.relations ?? [])].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
  const shown: Rel[] = [];
  for (const relation of relations) {
    if (kind !== undefined && kind !== null && relationType(relation) !== kind) continue;
    const target = relation.id;
    if (typeof target !== "string" || !target) continue;
    if (backend.shown(target)) shown.push(relation);
  }
  return shown;
}

export function links(backend: Backend, item: McpItem | null, limit: number, withMore = true) {
  if (!item) return [] as (ReturnType<typeof relationView> | { rel: "more"; id: null; cursor: string })[];
  const shown = shownRelations(backend, item);
  const out: (ReturnType<typeof relationView> | { rel: "more"; id: null; cursor: string })[] = shown
    .slice(0, limit)
    .map(relationView);
  if (withMore && shown.length > limit) {
    // "more" carries an id key like the others so callers can walk links uniformly.
    out.push({ rel: "more", id: null, cursor: makeCursor(item.id, limit) });
  }
  return out;
}

const MOVE_ORDER = ["up", "down", "prev", "next", "speaker"] as const;

export function moves(backend: Backend, item: McpItem) {
  const got = item.moves ?? {};
  const out: { rel: string; id: string; title: string | null; url: string | null }[] = [];
  for (const rel of MOVE_ORDER) {
    const value = got[rel];
    let targets: Move[];
    if (rel === "down") {
      targets = Array.isArray(value) ? value.slice(0, MAX_LINKS) : [];
    } else if (value && !Array.isArray(value)) {
      targets = [value];
    } else {
      targets = [];
    }
    for (const target of targets) {
      const targetId = target?.id;
      if (typeof targetId !== "string" || !validId(targetId)) continue;
      if (!backend.shown(targetId)) continue;
      out.push({ rel, id: targetId, title: target.title ?? null, url: target.url ?? null });
    }
  }
  return out;
}

export function map(backend: Backend, item: McpItem) {
  // The neighborhood at a glance: one entry per relation type whose target is shown.
  const groups = new Map<string, {
    type: string;
    rel: string | null;
    iri: string | null;
    count: number;
    readings: number;
    definition: string | null;
  }>();
  for (const relation of shownRelations(backend, item)) {
    const rtype = relationType(relation);
    if (rtype === null) continue;
    let group = groups.get(rtype);
    if (!group) {
      const vtype = vocabType(relation);
      group = {
        type: rtype,
        rel: relation.rel,
        iri: vtype ? NS + vtype : null,
        count: 0,
        readings: 0,
        definition: vtype ? "relation:" + vtype : null,
      };
      groups.set(rtype, group);
    }
    group.count += 1;
    if (relation.certainty === "reading") group.readings += 1;
  }
  const entries = [...groups.values()].sort((a, b) => b.count - a.count);
  return entries.map((entry) => ({
    ...entry,
    get: {
      tool: "get_relations",
      arguments: { id: item.id, kind: entry.type },
    },
  }));
}

export function fit(structured: Record<string, unknown>): void {
  if (JSON.stringify(structured).length <= MAX_BYTES) return;
  structured.truncated = true;
  let guard = 0;
  while (JSON.stringify(structured).length > MAX_BYTES && guard++ < 1000) {
    const text = typeof structured.text === "string" ? structured.text : "";
    const verses = Array.isArray(structured.verses) ? (structured.verses as unknown[]) : null;
    if (text && (text.length > 2000 || !verses?.length)) {
      structured.text = text.slice(0, Math.floor(text.length / 2));
    } else if (verses?.length) {
      verses.pop();
    } else if (text) {
      structured.text = text.slice(0, Math.floor(text.length / 2));
    } else {
      break;
    }
  }
  while (JSON.stringify(structured).length > MAX_BYTES && Array.isArray(structured.links) && structured.links.length) {
    (structured.links as unknown[]).pop();
  }
}

export function toolResult(structured: Record<string, unknown>, linkList?: LinkLike[]): ToolResult {
  const content: ToolResult["content"] = [
    { type: "text", text: JSON.stringify(structured) },
  ];
  const list = (linkList ?? (structured.links as LinkLike[] | undefined) ?? []);
  for (const link of list) {
    if (link.rel === "more") continue;
    content.push({
      type: "resource_link",
      uri: link.url ?? "",
      name: link.title ?? "",
      description: link.rel ?? "",
    });
  }
  return { content, structuredContent: structured };
}

// ------------------------------------------------------------------ the tools
export function startTool(backend: Backend): ToolResult {
  const entry = backend.start();
  const linkList = [];
  for (const link of entry.links) {
    if (!validId(link.id) || !backend.shown(link.id)) continue;
    linkList.push({ rel: link.rel, id: link.id, title: link.title, url: link.url });
  }
  const structured: Record<string, unknown> = {
    text: entry.text ?? "",
    links: linkList,
    sources: backend.sources,
    credit: CREDIT,
    data_version: backend.dataVersion,
  };
  return toolResult(structured);
}

export function searchTool(backend: Backend, query: string): ToolResult {
  const results = [];
  const allLinks: LinkLike[] = [];
  const hits = backend.search(query, 20).filter((h) => validId(h.id) && backend.shown(h.id));
  for (const [n, hit] of hits.slice(0, 10).entries()) {
    // the first five hits carry their three strongest hops; the rest only their
    // title and url, since each hop list costs a whole item build
    const item = n < 5 ? backend.item(hit.id) : null;
    const linkList = item ? (links(backend, item, 3, false) as LinkLike[]) : [];
    allLinks.push(...linkList);
    results.push({ id: hit.id, title: hit.title, url: hit.url, links: linkList });
  }
  const structured: Record<string, unknown> = {
    results,
    sources: backend.sources,
    credit: CREDIT,
    data_version: backend.dataVersion,
  };
  return toolResult(structured, allLinks);
}

export function fetchTool(backend: Backend, id: unknown): ToolResult {
  if (!validId(id)) throw new ToolError("invalid id");
  const item = backend.item(id);
  if (!item || item.shown === false) throw new ToolError("no such item");

  const structured: Record<string, unknown> = {
    id: item.id ?? id,
    title: item.title ?? "",
    url: item.url ?? "",
    text: item.text ?? "",
    verses: [...(item.verses ?? [])],
    links: links(backend, item, MAX_LINKS, true),
    moves: moves(backend, item),
    map: map(backend, item),
    schema: item.schema ?? null,
    // a source only some answers carry (the UBS senses, CC BY-SA) is credited on those answers
    sources: [...backend.sources, ...(item.sources_extra ?? [])],
    credit: CREDIT,
    data_version: backend.dataVersion,
  };
  fit(structured);
  const contentLinks = [
    ...(structured.links as LinkLike[]),
    ...(structured.moves as LinkLike[]),
  ];
  return toolResult(structured, contentLinks);
}

export function getRelationsTool(backend: Backend, args: { id: unknown; kind?: unknown; cursor?: unknown }): ToolResult {
  const itemId = args.id;
  if (!validId(itemId)) throw new ToolError("invalid id");
  const item = backend.item(itemId);
  if (!item || item.shown === false) throw new ToolError("no such item");

  let kind = args.kind;
  if (kind !== undefined && kind !== null && typeof kind !== "string") throw new ToolError("invalid kind");
  if (kind === null) kind = undefined;

  let offset = 0;
  if (args.cursor !== undefined && args.cursor !== null) {
    const payload = readCursor(args.cursor);
    if (payload === null || payload.id !== itemId) throw new ToolError("invalid cursor");
    if (kind === undefined && payload.kind) kind = payload.kind;
    if (kind !== undefined && payload.kind !== undefined && payload.kind !== kind) {
      throw new ToolError("invalid cursor");
    }
    offset = payload.offset;
  }

  const shown = shownRelations(backend, item, kind as string | undefined);
  const page = shown.slice(offset, offset + MAX_RELATIONS);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < shown.length ? makeCursor(itemId, nextOffset, (kind as string) ?? null) : null;
  const relViews = page.map(relationView);
  const structured: Record<string, unknown> = {
    id: itemId,
    relations: relViews,
    next_cursor: nextCursor,
    sources: backend.sources,
    credit: CREDIT,
    data_version: backend.dataVersion,
  };
  return toolResult(structured, relViews);
}

export function getVerseTool(backend: Backend, ref: unknown): ToolResult {
  if (typeof ref !== "string") throw new ToolError("invalid reference");
  const match = RE_REF.exec(ref.trim());
  if (!match) throw new ToolError("invalid reference");
  const book = match[1];
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  if (!(chapter >= 1 && chapter <= 999 && verse >= 1 && verse <= 999)) {
    throw new ToolError("invalid reference");
  }
  return fetchTool(backend, `verse:${book}.${chapter}.${verse}`);
}

export function getWordTool(backend: Backend, strong: unknown): ToolResult {
  if (typeof strong !== "string" || !RE_STRONG.test(strong)) {
    throw new ToolError("invalid strong's number");
  }
  return fetchTool(backend, "word:" + strong);
}

export const ERROR_MESSAGES = _ERROR_MESSAGES;
