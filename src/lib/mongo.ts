/**
 * The MongoDB store (opt-in).
 *
 *   BIBLE_MCP_STORE=mongodb MONGODB_URI=mongodb://127.0.0.1:27017/bible_mcp
 *
 * `npm run seed` loads ontology-data/*.json into these collections. The server
 * still answers from memory (the graph is a snapshot, and every answer is a
 * lookup), but the snapshot is read from MongoDB instead of the files. The
 * default remains the JSON files; nothing changes when this is unset.
 */
import mongoose from "mongoose";
import type {
  Entity,
  Meta,
  Question,
  Schema,
  SearchData,
  Snapshot,
  Theme,
  VerseLink,
  Word,
} from "./data";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/bible_mcp";
const DB = process.env.MONGODB_DB ?? "bible_mcp";

let cache: Snapshot | null = null;

async function connect(): Promise<void> {
  if (mongoose.connection.readyState !== 0) return;
  await mongoose.connect(URI, {
    dbName: DB,
    serverSelectionTimeoutMS: 5000,
  });
}

async function mapDocs<T>(
  db: mongoose.mongo.Db,
  name: string,
  pick: (doc: Record<string, unknown>) => T | undefined,
): Promise<Record<string, T>> {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) throw new Error(`MongoDB collection "${name}" is missing. Run: npm run seed`);
  const out: Record<string, T> = {};
  for await (const doc of db.collection(name).find({})) {
    const id = String(doc._id);
    const v = pick(doc);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

async function singleton<T>(db: mongoose.mongo.Db, name: string, id: string): Promise<T> {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) throw new Error(`MongoDB collection "${name}" is missing. Run: npm run seed`);
  const doc = await db.collection<{ _id: string; v: unknown }>(name).findOne({ _id: id });
  if (!doc) throw new Error(`MongoDB document ${name}/${id} is missing. Run: npm run seed`);
  return doc.v as T;
}

export async function mongoSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  await connect();
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection has no database handle");
  const [meta, addrs, schema, search, entities, verses, links, words, themes, questions] =
    await Promise.all([
      singleton<Meta>(db, "snapshot", "meta"),
      singleton<Record<string, string>>(db, "snapshot", "addrs"),
      singleton<Schema>(db, "snapshot", "schema"),
      singleton<SearchData>(db, "snapshot", "search"),
      mapDocs<Entity>(db, "entities", (d) => d.entity as Entity),
      mapDocs<string>(db, "verses", (d) => d.text as string),
      mapDocs<VerseLink>(db, "verse_links", (d) => d.link as VerseLink),
      mapDocs<Word>(db, "words", (d) => d.word as Word),
      mapDocs<Theme>(db, "themes", (d) => d.theme as Theme),
      mapDocs<Question>(db, "questions", (d) => d.question as Question),
    ]);
  cache = { meta, addrs, schema, search, entities, verses, links, words, themes, questions };
  return cache;
}
