/**
 * The ontology snapshot, read once from ./ontology-data.
 *
 * Nothing here writes, fetches or mutates: the snapshot is the whole world the
 * server serves. It is cached on globalThis so Next's dev reloads keep one copy.
 */
import fs from "node:fs";
import path from "node:path";

export type GroupItem = {
  label?: string | null;
  type?: string | null;
  dir?: "in" | "out" | string;
  other: string;
  name?: string | null;
  otype?: string | null;
  refs?: string[];
  certainty?: string | null;
  claimed_by_name?: string | null;
};

export type Entity = {
  name: string;
  type?: string | null;
  desc?: string | null;
  refs?: string[];
  aka?: string[];
  alias_of?: string;
  groups?: { category: string; items: GroupItem[] }[];
  mthemes?: { theme: string; title: string }[];
  event?: { within?: unknown; tellings?: { id: string; label?: string }[] };
  evcard?: {
    cast?: {
      subjects?: { id?: string; name?: string }[];
      verb?: string;
      object?: { id?: string; name?: string; type?: string };
      cites?: { go?: string }[];
      certainty?: string | null;
      claimed_by?: { name?: string } | null;
    }[];
    quotes?: {
      from_go?: string | string[];
      to_go?: string | string[];
      to_ref?: string | string[];
      verb?: string;
      speaker?: unknown;
    }[];
  };
};

export type VerseLink = {
  editors?: { kind?: string; target: string }[];
  earlier?: { target: string; band: string; band_note: string }[];
  later?: { target: string; band: string; band_note: string }[];
  aligned?: { target: string }[];
  allusions?: Record<string, { target: string; reader?: string; before?: boolean }[]>;
};

export type Word = {
  lemma: string;
  translit: string;
  lang: string;
  short?: string | null;
  gloss?: string | null;
  definition?: string | null;
  definition_credit?: string | null;
  occurrences: string[];
  ubs?: {
    credit?: string;
    licence?: string;
    licence_url?: string;
    edited?: string;
    url?: string;
    senses: {
      glosses: string[];
      short?: string | null;
      domains: { label?: string }[];
      refs: string[];
    }[];
  } | null;
};

export type Theme = {
  title: string;
  subtitle?: string;
  path: string;
  events?: { title?: string; listed?: boolean }[];
};

export type Question = {
  question: string;
  intro?: string;
  path: string;
  readings?: { label?: string; summary?: string }[];
};

export type Schema = {
  types: Record<string, Record<string, unknown>>;
  defs: Record<string, { definition?: string }>;
  kinds: string[];
  relations: Record<string, unknown>;
  kind_items: Record<string, unknown>;
};

export type SearchData = {
  entities: {
    id: string;
    name: string;
    aka: string[];
    type?: string | null;
    nrels: number;
    whole?: string;
  }[];
  themes: { id: string; title: string; subtitle?: string; concepts?: string[] }[];
  books: { code: string; title: string; chapters: number }[];
  book_aliases?: Record<string, string>;
};

export type Meta = {
  site: string;
  data_version: string;
  sources: { name: string; licence: string; url: string }[];
  credit: string;
  generated_at?: string;
};

export type Snapshot = {
  meta: Meta;
  addrs: Record<string, string>;
  verses: Record<string, string>;
  links: Record<string, VerseLink>;
  words: Record<string, Word>;
  themes: Record<string, Theme>;
  questions: Record<string, Question>;
  schema: Schema;
  search: SearchData;
  entities: Record<string, Entity>;
};

const DATA_DIR = process.env.BIBLE_MCP_DATA
  ? path.resolve(process.env.BIBLE_MCP_DATA)
  : path.join(process.cwd(), "ontology-data");

function readJson<T>(name: string): T {
  const file = path.join(DATA_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

const globalKey = "__bibleMcpSnapshot" as const;

export function snapshot(): Snapshot {
  const g = globalThis as unknown as Record<string, Snapshot | undefined>;
  if (g[globalKey]) return g[globalKey]!;
  const snap: Snapshot = {
    meta: readJson<Meta>("meta.json"),
    addrs: (() => {
      try {
        return readJson<Record<string, string>>("card-slugs.json");
      } catch {
        return {};
      }
    })(),
    verses: readJson<Record<string, string>>("verses.json"),
    links: readJson<Record<string, VerseLink>>("verse-links.json"),
    words: readJson<Record<string, Word>>("words.json"),
    themes: readJson<Record<string, Theme>>("themes.json"),
    questions: readJson<Record<string, Question>>("questions.json"),
    schema: readJson<Schema>("schema.json"),
    search: readJson<SearchData>("search.json"),
    entities: readJson<Record<string, Entity>>("entities.json"),
  };
  g[globalKey] = snap;
  return snap;
}

/**
 * The snapshot from the configured store. The JSON files are the default;
 * `BIBLE_MCP_STORE=mongodb` reads the same data from MongoDB (npm run seed).
 */
export async function loadSnapshot(): Promise<Snapshot> {
  if ((process.env.BIBLE_MCP_STORE ?? "").toLowerCase() === "mongodb") {
    const { mongoSnapshot } = await import("./mongo");
    return mongoSnapshot();
  }
  return snapshot();
}
